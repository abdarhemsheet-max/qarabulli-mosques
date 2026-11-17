import type { MosqueRecord, UserProfile } from '../types/mosque';
import { generateGoogleMapsUrl } from './utils/geo';

/**
 * Local-only preview with sample data (http://localhost:3000/?demo=1).
 * Never active in production builds.
 */
export const isDemoMode =
  import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo');

export const DEMO_USER: UserProfile = {
  uid: 'demo-admin',
  name: 'عبدالرحيم',
  email: 'demo@example.com',
  role: 'admin',
  createdBy: 'demo-admin',
};

function photo(hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="hsl(${hue},35%,78%)"/><path d="M200 70l14 22h-28z" fill="#0f4c3a"/><path d="M130 170a70 70 0 0 1 140 0v90H130z" fill="#0f4c3a"/><rect x="185" y="200" width="30" height="60" rx="15" fill="#c9a24b"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const base = { lat: 32.7427, lng: 13.7128 };
const samples: [string, string, number, number, MosqueRecord['googleMapsStatus'], string, number][] = [
  ['مسجد الصحابة', 'وسط البلد', 0.0012, -0.0008, 'live', 'عبدالرحيم', 2],
  ['مسجد عمر بن الخطاب', 'السوق', -0.0035, 0.0041, 'submitted', 'محمد الطاهر', 1],
  ['مسجد الفاروق', 'الشرفة', 0.0061, 0.0072, 'not_submitted', 'محمد الطاهر', 0],
  ['جامع القره بوللي الكبير', 'وسط البلد', -0.0009, -0.0052, 'live', 'عبدالرحيم', 3],
  ['مسجد أبي بكر الصديق', 'المصيف', 0.0451, 0.0248, 'not_submitted', 'سالم', 1],
  ['مسجد النور', 'السوق', -0.0081, 0.0013, 'not_submitted', 'سالم', 0],
];

export const DEMO_MOSQUES: MosqueRecord[] = samples.map(([name, locality, dLat, dLng, status, by, photos], i) => {
  const lat = base.lat + dLat;
  const lng = base.lng + dLng;
  const created = new Date(Date.now() - i * 26 * 3600 * 1000);
  return {
    id: `demo_${i}`,
    officialName: name,
    commonName: i === 1 ? 'مسجد السوق' : '',
    locality,
    landmark: i % 2 === 0 ? 'قرب المدرسة' : '',
    notes: '',
    mapsUrl: generateGoogleMapsUrl(lat, lng),
    lat,
    lng,
    accuracy: 6 + i,
    photos: Array.from({ length: photos }, (_, j) => photo((i * 50 + j * 30) % 360)),
    photoCount: photos,
    osmId: '',
    googlePlaceId: '',
    createdBy: by === 'عبدالرحيم' ? 'demo-admin' : `demo-${by}`,
    createdByName: by,
    createdAt: created,
    updatedAt: created,
    updatedBy: '',
    googleMapsStatus: status,
    googleMapsSubmittedAt: status === 'not_submitted' ? null : created,
    googleMapsSubmittedByName: status === 'not_submitted' ? '' : by,
  };
});
