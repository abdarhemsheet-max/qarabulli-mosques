import { osmAuth, OSMAuthError } from 'osm-auth';
import osmConfig from '../../../osm-config.json';
import type { MosqueRecord } from '../../types/mosque';

export const OSM_WEB_URL = 'https://www.openstreetmap.org';
export const OSM_API_URL = 'https://api.openstreetmap.org';

/**
 * Public OAuth2 client ID of the office's OpenStreetMap app (not a secret:
 * OSM "public" apps use PKCE). Set once in osm-config.json.
 */
export function getOsmClientId(): string {
  return ((import.meta.env.VITE_OSM_CLIENT_ID as string | undefined) || osmConfig.clientId || '').trim();
}

export function isOsmPublishingConfigured(): boolean {
  return Boolean(getOsmClientId());
}

export function getOsmRedirectUri(): string {
  const baseUrl = import.meta.env.BASE_URL || '/';
  return new URL(`${baseUrl}osm-callback.html`, window.location.origin).toString();
}

export interface ParsedOsmId {
  type: 'node' | 'way' | 'relation';
  id: number;
}

export function parseOsmId(osmId?: string): ParsedOsmId | null {
  const m = /^(node|way|relation)_(\d+)$/.exec((osmId ?? '').trim());
  return m ? { type: m[1] as ParsedOsmId['type'], id: Number(m[2]) } : null;
}

export function osmElementUrl(osmId?: string): string | null {
  const p = parseOsmId(osmId);
  return p ? `${OSM_WEB_URL}/${p.type}/${p.id}` : null;
}

/** Read an element's tags from the public OSM API (no login needed). */
export async function fetchOsmTags(osmId: string): Promise<Record<string, string> | null> {
  const p = parseOsmId(osmId);
  if (!p) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${OSM_API_URL}/api/0.6/${p.type}/${p.id}.json`, { signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { elements?: { tags?: Record<string, string> }[] };
    return json.elements?.[0]?.tags ?? {};
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Tags the office publishes for a mosque (correct OSM tagging for a point). */
export function mosqueOsmTags(mosque: Pick<MosqueRecord, 'officialName' | 'commonName'>): Record<string, string> {
  const tags: Record<string, string> = {
    amenity: 'place_of_worship',
    religion: 'muslim',
    name: mosque.officialName.trim(),
    'name:ar': mosque.officialName.trim(),
  };
  const common = mosque.commonName.trim();
  if (common && common !== mosque.officialName.trim()) tags.alt_name = common;
  return tags;
}

function tagLines(tags: Map<string, string> | Record<string, string>): string {
  const entries = tags instanceof Map ? [...tags.entries()] : Object.entries(tags);
  return entries
    .filter(([, v]) => Boolean(v))
    .map(([k, v]) => `    <tag k="${escapeXml(k)}" v="${escapeXml(v)}" />`)
    .join('\n');
}

export interface OsmPublishResult {
  osmId: string;
  elementUrl: string;
  changesetUrl: string;
  action: 'updated' | 'created';
}

export async function publishMosqueToOsm(mosque: MosqueRecord): Promise<OsmPublishResult> {
  const clientId = getOsmClientId();
  if (!clientId) {
    throw new Error('لم يُربط حساب المكتب في OpenStreetMap بعد. راجع مدير المكتب (شاشة الإدارة).');
  }

  const auth = new osmAuth({
    url: OSM_WEB_URL,
    apiUrl: OSM_API_URL,
    client_id: clientId,
    redirect_uri: getOsmRedirectUri(),
    scope: 'read_prefs write_api',
  });

  try {
    await auth.authenticateAsync();
  } catch (err) {
    if (err instanceof OSMAuthError) {
      if (err.code === 'popup-blocked') throw new Error('المتصفح منع نافذة الدخول. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.');
      if (err.code === 'access_denied') throw new Error('تم إلغاء الدخول إلى OpenStreetMap.');
      throw new Error(`تعذّر الدخول إلى OpenStreetMap: ${err.message}`);
    }
    throw err;
  }

  const tags = mosqueOsmTags(mosque);
  const csRes = await auth.fetch(`${OSM_API_URL}/api/0.6/changeset/create`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    body: `<osm>
  <changeset>
    <tag k="created_by" v="Qarabulli Awqaf mosque survey app" />
    <tag k="comment" v="${escapeXml(`توثيق ميداني: ${mosque.officialName} (${mosque.locality}) — مكتب أوقاف القره بوللي`)}" />
    <tag k="source" v="survey" />
  </changeset>
</osm>`,
  });
  if (!csRes.ok) throw new Error(`تعذّر بدء التعديل في OpenStreetMap (${csRes.status}).`);
  const changesetId = (await csRes.text()).trim();

  try {
    const linked = parseOsmId(mosque.osmId);

    if (linked && linked.type !== 'relation') {
      const getRes = await auth.fetch(`${OSM_API_URL}/api/0.6/${linked.type}/${linked.id}`, { method: 'GET' });
      if (getRes.ok) {
        const doc = new DOMParser().parseFromString(await getRes.text(), 'application/xml');
        const el = doc.querySelector(linked.type);
        if (!el) throw new Error('تعذّر قراءة العنصر من OpenStreetMap.');
        const merged = new Map<string, string>();
        el.querySelectorAll(':scope > tag').forEach((t) => {
          const k = t.getAttribute('k');
          const v = t.getAttribute('v');
          if (k && v !== null) merged.set(k, v);
        });
        Object.entries(tags).forEach(([k, v]) => v && merged.set(k, v));
        const version = el.getAttribute('version') ?? '1';
        const body =
          linked.type === 'node'
            ? `<osm>
  <node id="${linked.id}" changeset="${changesetId}" version="${escapeXml(version)}" lat="${escapeXml(el.getAttribute('lat') ?? '')}" lon="${escapeXml(el.getAttribute('lon') ?? '')}">
${tagLines(merged)}
  </node>
</osm>`
            : `<osm>
  <way id="${linked.id}" changeset="${changesetId}" version="${escapeXml(version)}">
${[...el.querySelectorAll(':scope > nd')].map((nd) => `    <nd ref="${escapeXml(nd.getAttribute('ref') ?? '')}" />`).join('\n')}
${tagLines(merged)}
  </way>
</osm>`;
        const putRes = await auth.fetch(`${OSM_API_URL}/api/0.6/${linked.type}/${linked.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/xml; charset=utf-8' },
          body,
        });
        if (!putRes.ok) throw new Error(`تعذّر تحديث المسجد في OpenStreetMap (${putRes.status}).`);
        const osmId = `${linked.type}_${linked.id}`;
        return {
          osmId,
          elementUrl: osmElementUrl(osmId)!,
          changesetUrl: `${OSM_WEB_URL}/changeset/${changesetId}`,
          action: 'updated',
        };
      }
    }

    const createRes = await auth.fetch(`${OSM_API_URL}/api/0.6/node/create`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      body: `<osm>
  <node changeset="${changesetId}" lat="${mosque.lat.toFixed(7)}" lon="${mosque.lng.toFixed(7)}">
${tagLines(tags)}
  </node>
</osm>`,
    });
    if (!createRes.ok) throw new Error(`تعذّر إضافة المسجد إلى OpenStreetMap (${createRes.status}).`);
    const osmId = `node_${(await createRes.text()).trim()}`;
    return {
      osmId,
      elementUrl: osmElementUrl(osmId)!,
      changesetUrl: `${OSM_WEB_URL}/changeset/${changesetId}`,
      action: 'created',
    };
  } finally {
    await auth.fetch(`${OSM_API_URL}/api/0.6/changeset/${changesetId}/close`, { method: 'PUT' }).catch(() => undefined);
  }
}
