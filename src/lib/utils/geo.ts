// Al-Qarabulli town centre (OpenStreetMap / Nominatim)
export const QARABULLI_CENTER = {
  lat: 32.7427,
  lng: 13.7128,
};

export function generateGoogleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/**
 * Navigation link that opens the phone's own maps app (free, no Google key):
 * Android → geo: intent (any installed maps app), iPhone → Apple Maps,
 * desktop → OpenStreetMap directions.
 */
export function generateDirectionsUrl(lat: number, lng: number, name = ''): string {
  const ll = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/Android/i.test(ua)) return `geo:${ll}?q=${ll}(${encodeURIComponent(name || 'مسجد')})`;
  if (/iPhone|iPad|iPod/i.test(ua)) return `https://maps.apple.com/?daddr=${ll}&q=${encodeURIComponent(name || 'مسجد')}`;
  return `https://www.openstreetmap.org/directions?route=%3B${encodeURIComponent(ll)}#map=17/${lat.toFixed(5)}/${lng.toFixed(5)}`;
}

/** View a spot on OpenStreetMap. */
export function generateOsmViewUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lng.toFixed(6)}#map=18/${lat.toFixed(5)}/${lng.toFixed(5)}`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} م`;
  return `${(meters / 1000).toFixed(1)} كم`;
}

export function timeAgoArabic(date: Date | null | undefined): string {
  if (!date) return '';
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `قبل ${diffMin} د`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `قبل ${diffH} س`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `قبل ${diffD} يوم`;
  return formatEnglishDate(date);
}

export interface ParsedGoogleMapsResult {
  lat: number;
  lng: number;
  placeName?: string;
}

/**
 * Parse coordinates and optional place name from a full Google Maps URL
 * or raw "lat, lng" string.
 */
export function parseGoogleMapsInput(rawInput: string):
  | { ok: true; data: ParsedGoogleMapsResult }
  | { ok: false; reason: 'short-link' | 'invalid' } {
  const input = rawInput.trim();
  if (!input) return { ok: false, reason: 'invalid' };

  if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(input)) {
    return { ok: false, reason: 'short-link' };
  }

  let placeName: string | undefined;
  const placeMatch = input.match(/\/place\/([^/@?]+)/i);
  if (placeMatch?.[1]) {
    try {
      const decoded = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
      if (decoded && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(decoded)) {
        placeName = decoded;
      }
    } catch {
      // ignore malformed URI encoding
    }
  }

  // Priority 1: exact pin coordinates !3dLAT!4dLNG
  const bangMatch = input.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (bangMatch) {
    const lat = Number(bangMatch[1]);
    const lng = Number(bangMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return { ok: true, data: { lat, lng, placeName } };
    }
  }

  // Priority 2: query params q= / query= / ll=
  const paramMatch = input.match(/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/i);
  if (paramMatch) {
    const lat = Number(paramMatch[1]);
    const lng = Number(paramMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return { ok: true, data: { lat, lng, placeName } };
    }
  }

  // Priority 3: viewport/place @lat,lng
  const atMatch = input.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    const lat = Number(atMatch[1]);
    const lng = Number(atMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return { ok: true, data: { lat, lng, placeName } };
    }
  }

  // Priority 4: raw "lat, lng"
  const rawMatch = input.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,،\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (rawMatch) {
    const lat = Number(rawMatch[1]);
    const lng = Number(rawMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return { ok: true, data: { lat, lng, placeName } };
    }
  }

  return { ok: false, reason: 'invalid' };
}

function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Haversine distance in meters between two geographic coordinates.
 */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Normalize Arabic text for accurate duplicate name detection.
 */
export function normalizeArabicName(input: string): string {
  return input
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove tashkeel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Format date strictly in English numerals: YYYY/MM/DD
 */
export function formatEnglishDate(date: Date | null | undefined): string {
  const d = date ?? new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

/**
 * Format date and time strictly in English numerals: YYYY/MM/DD HH:MM
 */
export function formatEnglishDateTime(date: Date | null | undefined): string {
  const d = date ?? new Date();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${formatEnglishDate(d)} ${hours}:${minutes}`;
}
