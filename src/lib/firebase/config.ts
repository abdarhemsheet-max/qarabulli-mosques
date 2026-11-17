import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';

const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

const databaseId = (
  firebaseConfig as { firestoreDatabaseId?: string }
).firestoreDatabaseId?.trim();

function initDb(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      databaseId || undefined
    );
  } catch {
    return databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  }
}

export const db: Firestore = initDb();
export const auth: Auth = getAuth(app);

/**
 * Secondary auth instance so an admin can provision a new documenter account
 * without signing out of the current admin session.
 */
export function getSecondaryAuth(): Auth {
  const secondaryName = 'secondary-user-provisioner';
  const existing = getApps().find((a) => a.name === secondaryName);
  const secondaryApp = existing ?? initializeApp(firebaseConfig, secondaryName);
  return getAuth(secondaryApp);
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
