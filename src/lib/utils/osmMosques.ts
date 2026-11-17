import type { OsmMosqueCandidate } from '../../types/mosque';

const CACHE_KEY = 'awqaf_qarabulli_osm_mosques_v3';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // refresh at most once a day

// Al-Qarabulli municipality and surrounding villages (south, west, north, east).
// The old box (lng 14.15–14.45) covered Al-Khums by mistake.
const QARABULLI_BBOX = '32.55,13.50,32.85,13.95';

const OVERPASS_QUERY = `
[out:json][timeout:15];
(
  node["amenity"="place_of_worship"]["religion"="muslim"](${QARABULLI_BBOX});
  way["amenity"="place_of_worship"]["religion"="muslim"](${QARABULLI_BBOX});
  relation["amenity"="place_of_worship"]["religion"="muslim"](${QARABULLI_BBOX});
);
out center;
`;

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function readCached(): { items: OsmMosqueCandidate[]; fresh: boolean } {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { items: [], fresh: false };
    const parsed = JSON.parse(raw) as { ts: number; items: OsmMosqueCandidate[] };
    if (!Array.isArray(parsed.items)) return { items: [], fresh: false };
    return {
      items: parsed.items,
      fresh: Date.now() - parsed.ts < CACHE_TTL_MS,
    };
  } catch {
    return { items: [], fresh: false };
  }
}

function writeCache(items: OsmMosqueCandidate[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
  } catch {
    // ignore storage quota errors
  }
}

interface SnapshotItem {
  osmId: string;
  osmType: 'node' | 'way' | 'relation';
  osmNumericId: number;
  name: string;
  lat: number;
  lng: number;
}

const ARABIC = /[؀-ۿ]/;

function fromSnapshot(item: SnapshotItem): OsmMosqueCandidate {
  const raw = (item.name || '').trim();
  const generic = !raw || /^mosque$/i.test(raw) || raw === 'مسجد';
  const display = generic ? 'مسجد (بدون اسم)' : raw;
  return {
    osmId: item.osmId,
    osmType: item.osmType,
    osmNumericId: item.osmNumericId,
    name: display,
    nameAr: ARABIC.test(display) ? display : '',
    nameRaw: display,
    tags: {},
    lat: item.lat,
    lng: item.lng,
  };
}

/** Bundled list shipped with the app (built from OpenStreetMap/Nominatim). */
async function loadSnapshot(): Promise<OsmMosqueCandidate[]> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}osm-mosques.json`, { cache: 'force-cache' });
    if (!res.ok) return [];
    const items = (await res.json()) as SnapshotItem[];
    return Array.isArray(items) ? items.map(fromSnapshot) : [];
  } catch {
    return [];
  }
}

/**
 * Shows mosques immediately (bundled list or cache), then tries a live
 * Overpass refresh in the background. Overpass is often slow or blocked on
 * Libyan networks, so each attempt is capped.
 */
export async function loadQarabulliOsmMosques(onData: (items: OsmMosqueCandidate[]) => void): Promise<void> {
  const cached = readCached();
  if (cached.items.length > 0) {
    onData(cached.items);
    if (cached.fresh) return;
  } else {
    const snapshot = await loadSnapshot();
    if (snapshot.length > 0) onData(snapshot);
  }

  const live = await fetchFromOverpass();
  if (live && live.length > 0) onData(live);
}

async function fetchFromOverpass(): Promise<OsmMosqueCandidate[] | null> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      if (!res.ok) continue;
      const json = (await res.json()) as { elements?: OverpassElement[] };
      const elements = json.elements ?? [];

      const seen = new Set<string>();
      const results: OsmMosqueCandidate[] = [];

      for (const el of elements) {
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        if (typeof lat !== 'number' || typeof lng !== 'number') continue;

        const osmId = `${el.type}_${el.id}`;
        if (seen.has(osmId)) continue;
        seen.add(osmId);

        const tags = el.tags ?? {};
        const nameAr = (tags['name:ar'] ?? '').trim();
        const nameRaw = (tags.name ?? '').trim();
        const name = nameAr || nameRaw || (tags.alt_name ?? '').trim() || 'مسجد بدون اسم (OSM)';

        results.push({
          osmId,
          osmType: el.type,
          osmNumericId: el.id,
          name,
          nameAr,
          nameRaw,
          tags,
          lat,
          lng,
        });
      }

      writeCache(results);
      return results;
    } catch {
      window.clearTimeout(timer);
      // try next Overpass mirror
    }
  }
  return null;
}
