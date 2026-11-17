import type { OsmMosqueCandidate } from '../../types/mosque';

const CACHE_KEY = 'awqaf_qarabulli_osm_mosques_v2';
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour strictly enforced

// Al-Qarabulli bounding box requested: (32.65,14.15,32.85,14.45)
const QARABULLI_BBOX = '32.65,14.15,32.85,14.45';

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

export async function fetchQarabulliOsmMosques(): Promise<OsmMosqueCandidate[]> {
  const cached = readCached();
  if (cached.fresh) {
    return cached.items;
  }

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
      });
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
      // try next Overpass mirror
    }
  }

  return cached.items;
}
