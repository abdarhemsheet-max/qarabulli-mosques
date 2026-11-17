import type {
  MapStatus,
  MosqueFormValues,
  MosqueRecord,
  UserProfile,
} from '../../types/mosque';
import { generateGoogleMapsUrl } from '../utils/geo';
import { supabase } from './client';
import { handleDbError, OperationType } from './errors';

export type Unsubscribe = () => void;

const MAX_RECORD_BYTES = 900 * 1024; // 900KB safety ceiling

interface MosqueRow {
  id: string;
  official_name: string;
  common_name: string;
  locality: string;
  landmark: string;
  notes: string;
  maps_url: string;
  lat: number;
  lng: number;
  accuracy: number;
  photos: string[] | null;
  photo_count: number | null;
  osm_id: string | null;
  google_place_id: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string | null;
  updated_at: string | null;
  updated_by: string;
  osm_published_at: string | null;
  osm_published_by_name: string | null;
}

function toMapStatus(row: MosqueRow): MapStatus {
  if (row.osm_published_at) return 'published';
  return row.osm_id ? 'linked' : 'none';
}

function mapMosque(row: MosqueRow): MosqueRecord {
  const photos = Array.isArray(row.photos) ? row.photos.map(String) : [];
  return {
    id: row.id,
    officialName: String(row.official_name ?? ''),
    commonName: String(row.common_name ?? ''),
    locality: String(row.locality ?? ''),
    landmark: String(row.landmark ?? ''),
    notes: String(row.notes ?? ''),
    mapsUrl: String(row.maps_url ?? ''),
    lat: Number(row.lat ?? 0),
    lng: Number(row.lng ?? 0),
    accuracy: Number(row.accuracy ?? 0),
    photos,
    photoCount: Number(row.photo_count ?? photos.length),
    osmId: row.osm_id ? String(row.osm_id) : '',
    googlePlaceId: row.google_place_id ? String(row.google_place_id) : '',
    createdBy: String(row.created_by ?? ''),
    createdByName: String(row.created_by_name ?? ''),
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
    updatedBy: String(row.updated_by ?? ''),
    mapStatus: toMapStatus(row),
    osmPublishedAt: row.osm_published_at ? new Date(row.osm_published_at) : null,
    osmPublishedByName: String(row.osm_published_by_name ?? ''),
    hasPendingWrites: false,
  };
}

function sanitizeMosquePayload(values: MosqueFormValues) {
  const officialName = values.officialName.trim().slice(0, 150);
  const commonName = values.commonName.trim().slice(0, 150);
  const locality = values.locality.trim().slice(0, 100);
  const landmark = values.landmark.trim().slice(0, 200);
  const notes = values.notes.trim().slice(0, 500);
  const lat = Number(values.lat.toFixed(6));
  const lng = Number(values.lng.toFixed(6));
  const accuracy = Math.max(0, Math.min(100000, Math.round(values.accuracy || 0)));
  const photos = values.photos.slice(0, 3);
  const mapsUrl = generateGoogleMapsUrl(lat, lng);
  const rawOsmId = (values.osmId ?? '').trim().slice(0, 64);
  const osmId = /^[a-zA-Z0-9_\-]*$/.test(rawOsmId) ? rawOsmId : '';
  const rawGooglePlaceId = (values.googlePlaceId ?? '').trim().slice(0, 128);
  const googlePlaceId = /^[a-zA-Z0-9_\-]*$/.test(rawGooglePlaceId) ? rawGooglePlaceId : '';

  if (!officialName) {
    throw new Error('يرجى إدخال الاسم الرسمي للمسجد.');
  }
  if (!locality) {
    throw new Error('يرجى تحديد المحلة / المنطقة.');
  }

  return {
    official_name: officialName,
    common_name: commonName,
    locality,
    landmark,
    notes,
    maps_url: mapsUrl,
    lat,
    lng,
    accuracy,
    photos,
    osm_id: osmId,
    google_place_id: googlePlaceId,
  };
}

function assertPayloadWithinSizeLimit(payload: Record<string, unknown>): void {
  const bytes = new Blob([JSON.stringify(payload)]).size;
  if (bytes >= MAX_RECORD_BYTES) {
    throw new Error('حجم بيانات المسجد والصور يتجاوز الحد المسموح (900 كيلوبايت). يرجى تقليل عدد الصور.');
  }
}

function assertOnline(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('لا يوجد اتصال بالإنترنت. يرجى الاتصال ثم إعادة المحاولة.');
  }
}

export function subscribeMosques(
  onData: (mosques: MosqueRecord[], meta: { fromCache: boolean; hasPendingWrites: boolean }) => void,
  onError: (err: Error) => void
): Unsubscribe {
  let active = true;
  let reloadTimer: number | null = null;

  const load = async () => {
    const { data, error } = await supabase
      .from('mosques')
      .select('*')
      .order('created_at', { ascending: false });
    if (!active) return;
    if (error) {
      // Keep showing the last list when the network drops instead of crashing the app.
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      try {
        handleDbError(error, OperationType.LIST, 'mosques');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
      return;
    }
    onData((data ?? []).map((row) => mapMosque(row as MosqueRow)), {
      fromCache: false,
      hasPendingWrites: false,
    });
  };

  const scheduleReload = () => {
    if (reloadTimer !== null) window.clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(() => {
      reloadTimer = null;
      void load();
    }, 250);
  };

  void load();

  const channel = supabase
    .channel(`mosques-${Math.random().toString(36).slice(2, 10)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mosques' }, scheduleReload)
    .subscribe();

  const handleOnline = () => scheduleReload();
  window.addEventListener('online', handleOnline);

  return () => {
    active = false;
    if (reloadTimer !== null) window.clearTimeout(reloadTimer);
    window.removeEventListener('online', handleOnline);
    void supabase.removeChannel(channel);
  };
}

export async function createMosque(
  values: MosqueFormValues,
  user: UserProfile
): Promise<{ id: string; pendingSync: boolean }> {
  assertOnline();
  const payload = {
    ...sanitizeMosquePayload(values),
    created_by_name: user.name.slice(0, 120) || 'موظف',
  };
  assertPayloadWithinSizeLimit(payload);

  const { data, error } = await supabase.from('mosques').insert(payload).select('id').single();
  if (error) handleDbError(error, OperationType.CREATE, 'mosques');

  return { id: String((data as { id: string }).id), pendingSync: false };
}

export async function updateMosque(
  mosqueId: string,
  values: MosqueFormValues,
  _user: UserProfile
): Promise<{ pendingSync: boolean }> {
  assertOnline();
  const payload = sanitizeMosquePayload(values);
  assertPayloadWithinSizeLimit(payload);

  const { data, error } = await supabase
    .from('mosques')
    .update(payload)
    .eq('id', mosqueId)
    .select('id');
  if (error) handleDbError(error, OperationType.UPDATE, `mosques/${mosqueId}`);
  if (!data || data.length === 0) {
    throw new Error('ليست لديك صلاحية لتعديل هذا المسجد.');
  }

  return { pendingSync: false };
}

/** Record that the mosque was published to OpenStreetMap (any staff member). */
export async function markOsmPublished(mosqueId: string, osmId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_osm_published', {
    p_mosque_id: mosqueId,
    p_osm_id: osmId,
  });
  if (error) handleDbError(error, OperationType.UPDATE, `mosques/${mosqueId}`);
}

export async function deleteMosque(mosqueId: string): Promise<{ pendingSync: boolean }> {
  assertOnline();
  const { data, error } = await supabase.from('mosques').delete().eq('id', mosqueId).select('id');
  if (error) handleDbError(error, OperationType.DELETE, `mosques/${mosqueId}`);
  if (!data || data.length === 0) {
    throw new Error('ليست لديك صلاحية لحذف هذا المسجد.');
  }
  return { pendingSync: false };
}
