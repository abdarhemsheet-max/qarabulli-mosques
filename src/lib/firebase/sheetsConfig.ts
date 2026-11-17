import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import type { GoogleSheetsConfig, UserProfile } from '../../types/mosque';
import { db } from './config';
import { handleFirestoreError, OperationType } from './errors';

const CONFIG_DOC_ID = 'office';
const CONFIG_PATH = `sheetSyncConfig/${CONFIG_DOC_ID}`;

export function subscribeGoogleSheetsConfig(
  onData: (config: GoogleSheetsConfig | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const ref = doc(db, 'sheetSyncConfig', CONFIG_DOC_ID);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data({ serverTimestamps: 'estimate' });
      onData({
        spreadsheetId: String(data.spreadsheetId ?? ''),
        spreadsheetTitle: String(data.spreadsheetTitle ?? ''),
        spreadsheetUrl: String(data.spreadsheetUrl ?? ''),
        sheetName: String(data.sheetName ?? ''),
        lastSyncedCount: Number(data.lastSyncedCount ?? 0),
        lastSyncedAt: data.lastSyncedAt?.toDate ? data.lastSyncedAt.toDate() : null,
        lastSyncedBy: String(data.lastSyncedBy ?? ''),
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, CONFIG_PATH);
      } catch (wrapped) {
        if (onError) onError(wrapped as Error);
      }
    }
  );
}

export async function saveGoogleSheetsConfig(
  params: {
    spreadsheetId: string;
    spreadsheetTitle: string;
    spreadsheetUrl: string;
    sheetName: string;
    lastSyncedCount: number;
  },
  user: UserProfile
): Promise<void> {
  const cleanId = params.spreadsheetId.trim().slice(0, 128);
  const cleanTitle = params.spreadsheetTitle.trim().slice(0, 200) || 'جدول مساجد القره بوللي';
  const cleanUrl =
    params.spreadsheetUrl.trim().slice(0, 300) ||
    `https://docs.google.com/spreadsheets/d/${cleanId}/edit`;
  const cleanSheetName = params.sheetName.trim().slice(0, 100) || 'المساجد';
  const safeCount = Math.max(0, Math.min(100000, Math.round(params.lastSyncedCount)));

  try {
    await setDoc(doc(db, 'sheetSyncConfig', CONFIG_DOC_ID), {
      spreadsheetId: cleanId,
      spreadsheetTitle: cleanTitle,
      spreadsheetUrl: cleanUrl,
      sheetName: cleanSheetName,
      lastSyncedCount: safeCount,
      lastSyncedAt: serverTimestamp(),
      lastSyncedBy: user.uid,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, CONFIG_PATH);
  }
}
