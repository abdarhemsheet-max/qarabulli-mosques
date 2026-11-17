import { osmAuth, OSMAuthError } from 'osm-auth';
import type { MosqueRecord } from '../../types/mosque';

export const OSM_SANDBOX_URL = 'https://master.apis.dev.openstreetmap.org';
export const OSM_PROD_WEB_URL = 'https://www.openstreetmap.org';
export const OSM_PROD_API_URL = 'https://api.openstreetmap.org';

export function getOsmRedirectUri(): string {
  const custom = (import.meta.env.VITE_OSM_REDIRECT_URI ?? '').trim();
  if (custom) return custom;
  const baseUrl = import.meta.env.BASE_URL || '/';
  return new URL(`${baseUrl}osm-callback.html`, window.location.origin).toString();
}

export function getOsmClientId(useProduction: boolean): string {
  const sandboxId = (import.meta.env.VITE_OSM_SANDBOX_CLIENT_ID ?? '').trim();
  const prodId = (import.meta.env.VITE_OSM_PROD_CLIENT_ID ?? '').trim();
  const sharedId = (import.meta.env.VITE_OSM_CLIENT_ID ?? '').trim();
  return useProduction ? prodId || sharedId : sandboxId || sharedId;
}

export function getOsmServerUrls(useProduction: boolean) {
  return useProduction
    ? { webUrl: OSM_PROD_WEB_URL, apiUrl: OSM_PROD_API_URL }
    : { webUrl: OSM_SANDBOX_URL, apiUrl: OSM_SANDBOX_URL };
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseLinkedOsmId(osmId?: string): { type: 'node' | 'way' | 'relation'; id: number } | null {
  if (!osmId) return null;
  const match = /^(node|way|relation)_(\d+)$/.exec(osmId.trim());
  if (!match) return null;
  return {
    type: match[1] as 'node' | 'way' | 'relation',
    id: Number(match[2]),
  };
}

export function getRequiredMosqueOsmTags(mosque: MosqueRecord): Record<string, string> {
  return {
    amenity: 'place_of_worship',
    religion: 'muslim',
    building: 'mosque',
    name: mosque.officialName.trim(),
    'name:ar': mosque.officialName.trim(),
  };
}

function buildUpdatedElementXml(
  docXml: Document,
  elementType: 'node' | 'way',
  elementId: number,
  changesetId: string,
  requiredTags: Record<string, string>
): string {
  const el = docXml.querySelector(elementType);
  if (!el) {
    throw new Error('تعذّر قراءة بيانات العنصر من خادم OpenStreetMap.');
  }
  const version = el.getAttribute('version') ?? '1';
  const mergedTags = new Map<string, string>();

  el.querySelectorAll(':scope > tag').forEach((tagNode) => {
    const k = tagNode.getAttribute('k');
    const v = tagNode.getAttribute('v');
    if (k && v !== null) mergedTags.set(k, v);
  });

  Object.entries(requiredTags).forEach(([k, v]) => {
    if (v) mergedTags.set(k, v);
  });

  const tagLines = Array.from(mergedTags.entries())
    .map(([k, v]) => `    <tag k="${escapeXmlAttr(k)}" v="${escapeXmlAttr(v)}" />`)
    .join('\n');

  if (elementType === 'node') {
    const lat = el.getAttribute('lat');
    const lon = el.getAttribute('lon');
    return `<osm>
  <node id="${elementId}" changeset="${escapeXmlAttr(changesetId)}" version="${escapeXmlAttr(version)}" lat="${escapeXmlAttr(lat ?? '')}" lon="${escapeXmlAttr(lon ?? '')}">
${tagLines}
  </node>
</osm>`;
  }

  const ndLines = Array.from(el.querySelectorAll(':scope > nd'))
    .map((nd) => `    <nd ref="${escapeXmlAttr(nd.getAttribute('ref') ?? '')}" />`)
    .join('\n');

  return `<osm>
  <way id="${elementId}" changeset="${escapeXmlAttr(changesetId)}" version="${escapeXmlAttr(version)}">
${ndLines}
${tagLines}
  </way>
</osm>`;
}

export interface OsmPublishResult {
  changesetId: string;
  changesetUrl: string;
  elementUrl: string;
  newOsmId: string;
  action: 'updated' | 'created';
  serverLabel: string;
}

export async function publishMosqueToOsm(
  mosque: MosqueRecord,
  useProduction: boolean
): Promise<OsmPublishResult> {
  const clientId = getOsmClientId(useProduction);
  if (!clientId) {
    const envVarName = useProduction ? 'VITE_OSM_PROD_CLIENT_ID' : 'VITE_OSM_SANDBOX_CLIENT_ID';
    throw new Error(
      `لم يتم ضبط معرف عميل OAuth2 في متغير البيئة (${envVarName}). أضفه في إعدادات البيئة مع عنوان العودة: ${getOsmRedirectUri()}`
    );
  }

  const { webUrl, apiUrl } = getOsmServerUrls(useProduction);
  const auth = new osmAuth({
    url: webUrl,
    apiUrl,
    client_id: clientId,
    redirect_uri: getOsmRedirectUri(),
    scope: 'write_api',
  });

  try {
    await auth.authenticateAsync();
  } catch (err) {
    if (err instanceof OSMAuthError) {
      if (err.code === 'popup-blocked') {
        throw new Error('قام المتصفح بحظر نافذة تسجيل الدخول. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.');
      }
      if (err.code === 'access_denied') {
        throw new Error('تم إلغاء تفويض الدخول لحساب OpenStreetMap.');
      }
      throw new Error(`تعذّر تسجيل الدخول إلى OpenStreetMap: ${err.message}`);
    }
    throw err;
  }

  const tags = getRequiredMosqueOsmTags(mosque);
  const changesetXml = `<osm>
  <changeset>
    <tag k="created_by" v="توثيق مساجد مكتب أوقاف القره بوللي" />
    <tag k="comment" v="توثيق/تحديث بيانات ${escapeXmlAttr(mosque.officialName)} (${escapeXmlAttr(mosque.locality)})" />
  </changeset>
</osm>`;

  const createCsRes = await auth.fetch(`${apiUrl}/api/0.6/changeset/create`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    body: changesetXml,
  });

  if (!createCsRes.ok) {
    const errText = await createCsRes.text();
    throw new Error(`تعذّر فتح حزمة التعديل (Changeset) في OSM: ${errText || createCsRes.status}`);
  }

  const changesetId = (await createCsRes.text()).trim();

  try {
    const linked = parseLinkedOsmId(mosque.osmId);
    let finalType: 'node' | 'way' = 'node';
    let finalNumericId = 0;
    let action: 'updated' | 'created' = 'created';

    if (linked && (linked.type === 'node' || linked.type === 'way')) {
      const getRes = await auth.fetch(`${apiUrl}/api/0.6/${linked.type}/${linked.id}`, {
        method: 'GET',
      });

      if (getRes.ok) {
        const rawXml = await getRes.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(rawXml, 'application/xml');
        const updatedBody = buildUpdatedElementXml(
          xmlDoc,
          linked.type,
          linked.id,
          changesetId,
          tags
        );
        const putRes = await auth.fetch(`${apiUrl}/api/0.6/${linked.type}/${linked.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/xml; charset=utf-8' },
          body: updatedBody,
        });
        if (!putRes.ok) {
          const msg = await putRes.text();
          throw new Error(`تعذّر تحديث العنصر في OSM: ${msg || putRes.status}`);
        }
        finalType = linked.type;
        finalNumericId = linked.id;
        action = 'updated';
      }
    }

    if (action === 'created') {
      const tagLines = Object.entries(tags)
        .filter(([, v]) => Boolean(v))
        .map(([k, v]) => `    <tag k="${escapeXmlAttr(k)}" v="${escapeXmlAttr(v)}" />`)
        .join('\n');

      const nodeXml = `<osm>
  <node changeset="${escapeXmlAttr(changesetId)}" lat="${mosque.lat.toFixed(6)}" lon="${mosque.lng.toFixed(6)}">
${tagLines}
  </node>
</osm>`;

      const createNodeRes = await auth.fetch(`${apiUrl}/api/0.6/node/create`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
        body: nodeXml,
      });

      if (!createNodeRes.ok) {
        const msg = await createNodeRes.text();
        throw new Error(`تعذّر إنشاء نقطة المسجد في OSM: ${msg || createNodeRes.status}`);
      }
      finalType = 'node';
      finalNumericId = Number((await createNodeRes.text()).trim());
    }

    return {
      changesetId,
      changesetUrl: `${webUrl}/changeset/${changesetId}`,
      elementUrl: `${webUrl}/${finalType}/${finalNumericId}`,
      newOsmId: `${finalType}_${finalNumericId}`,
      action,
      serverLabel: useProduction ? 'openstreetmap.org (الحقيقي)' : 'master.apis.dev.openstreetmap.org (التجريبي)',
    };
  } finally {
    await auth
      .fetch(`${apiUrl}/api/0.6/changeset/${changesetId}/close`, { method: 'PUT' })
      .catch(() => undefined);
  }
}
