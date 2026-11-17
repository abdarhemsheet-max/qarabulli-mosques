import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import type { MosqueFormValues, MosqueRecord, UserProfile } from '../../types/mosque';
import { generateGoogleMapsUrl } from '../utils/geo';
import { db } from './config';
import { handleFirestoreError, OperationType } from './errors';

const MAX_RECORD_BYTES = 900 * 1024; // 900KB safety ceiling

function generateSafeMosqueId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `mosque_${Date.now()}_${rand}`;
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
    officialName,
    commonName,
    locality,
    landmark,
    notes,
    mapsUrl,
    lat,
    lng,
    accuracy,
    photos,
    photoCount: photos.length,
    osmId,
    googlePlaceId,
  };
}

function assertPayloadWithinSizeLimit(payload: Record<string, unknown>): void {
  const bytes = new Blob([JSON.stringify(payload)]).size;
  if (bytes >= MAX_RECORD_BYTES) {
    throw new Error('حجم بيانات المسجد والصور يتجاوز الحد المسموح (900 كيلوبايت). يرجى تقليل عدد الصور.');
  }
}

/**
 * Execute a Firestore write that resolves immediately when offline (queued in IndexedDB)
 * or once acknowledged online within 1.5s, while still reporting any real permission errors.
 */
async function executeOfflineFriendlyWrite(
  writePromise: Promise<void>,
  op: OperationType,
  path: string
): Promise<{ pendingSync: boolean }> {
  const guardedPromise = writePromise.catch((error) => {
    handleFirestoreError(error, op, path);
  });

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { pendingSync: true };
  }

  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    setTimeout(() => resolve('timeout'), 1500);
  });

  const outcome = await Promise.race([
    guardedPromise.then(() => 'committed' as const),
    timeoutPromise,
  ]);

  return { pendingSync: outcome === 'timeout' };
}

export function subscribeMosques(
  onData: (mosques: MosqueRecord[], meta: { fromCache: boolean; hasPendingWrites: boolean }) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'mosques'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      const list: MosqueRecord[] = snapshot.docs.map((d) => {
        const data = d.data({ serverTimestamps: 'estimate' });
        const photos = Array.isArray(data.photos) ? data.photos.map(String) : [];
        return {
          id: d.id,
          officialName: String(data.officialName ?? ''),
          commonName: String(data.commonName ?? ''),
          locality: String(data.locality ?? ''),
          landmark: String(data.landmark ?? ''),
          notes: String(data.notes ?? ''),
          mapsUrl: String(data.mapsUrl ?? ''),
          lat: Number(data.lat ?? 0),
          lng: Number(data.lng ?? 0),
          accuracy: Number(data.accuracy ?? 0),
          photos,
          photoCount: Number(data.photoCount ?? photos.length),
          osmId: data.osmId ? String(data.osmId) : '',
          googlePlaceId: data.googlePlaceId ? String(data.googlePlaceId) : '',
          createdBy: String(data.createdBy ?? ''),
          createdByName: String(data.createdByName ?? ''),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
          updatedBy: String(data.updatedBy ?? ''),
          hasPendingWrites: d.metadata.hasPendingWrites,
        };
      });

      onData(list, {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'mosques');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function createMosque(
  values: MosqueFormValues,
  user: UserProfile
): Promise<{ id: string; pendingSync: boolean }> {
  const sanitized = sanitizeMosquePayload(values);
  const mosqueId = generateSafeMosqueId();
  const path = `mosques/${mosqueId}`;

  const payload = {
    ...sanitized,
    createdBy: user.uid,
    createdByName: user.name.slice(0, 120) || 'موظف',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  };

  assertPayloadWithinSizeLimit(payload);

  const { pendingSync } = await executeOfflineFriendlyWrite(
    setDoc(doc(db, 'mosques', mosqueId), payload),
    OperationType.CREATE,
    path
  );

  return { id: mosqueId, pendingSync };
}

export async function updateMosque(
  mosqueId: string,
  values: MosqueFormValues,
  user: UserProfile
): Promise<{ pendingSync: boolean }> {
  const sanitized = sanitizeMosquePayload(values);
  const path = `mosques/${mosqueId}`;

  const payload = {
    ...sanitized,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  };

  assertPayloadWithinSizeLimit(payload);

  return executeOfflineFriendlyWrite(
    updateDoc(doc(db, 'mosques', mosqueId), payload),
    OperationType.UPDATE,
    path
  );
}

export async function linkMosqueOsmId(
  mosqueId: string,
  osmId: string,
  user: UserProfile
): Promise<void> {
  const safeOsmId = osmId.trim().slice(0, 64);
  if (!/^[a-zA-Z0-9_\-]+$/.test(safeOsmId)) return;
  const path = `mosques/${mosqueId}`;
  await executeOfflineFriendlyWrite(
    updateDoc(doc(db, 'mosques', mosqueId), {
      osmId: safeOsmId,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    }),
    OperationType.UPDATE,
    path
  );
}

export async function deleteMosque(mosqueId: string): Promise<{ pendingSync: boolean }> {
  const path = `mosques/${mosqueId}`;
  return executeOfflineFriendlyWrite(
    deleteDoc(doc(db, 'mosques', mosqueId)),
    OperationType.DELETE,
    path
  );
}
