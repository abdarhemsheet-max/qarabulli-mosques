import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import type { OsmSettings, UserProfile } from '../../types/mosque';
import { db } from './config';
import { handleFirestoreError, OperationType } from './errors';

export const DEFAULT_OSM_SETTINGS: OsmSettings = {
  osmPublishEnabled: false,
  osmUseProduction: false,
};

export function subscribeOsmSettings(
  onData: (settings: OsmSettings) => void
): Unsubscribe {
  const ref = doc(db, 'appSettings', 'osm');
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(DEFAULT_OSM_SETTINGS);
        return;
      }
      const data = snap.data();
      onData({
        osmPublishEnabled: Boolean(data.osmPublishEnabled),
        osmUseProduction: Boolean(data.osmUseProduction),
      });
    },
    () => {
      onData(DEFAULT_OSM_SETTINGS);
    }
  );
}

export async function saveOsmSettings(
  settings: OsmSettings,
  adminUser: UserProfile
): Promise<void> {
  const path = 'appSettings/osm';
  try {
    await setDoc(doc(db, 'appSettings', 'osm'), {
      osmPublishEnabled: Boolean(settings.osmPublishEnabled),
      osmUseProduction: Boolean(settings.osmUseProduction),
      updatedAt: serverTimestamp(),
      updatedBy: adminUser.uid,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
