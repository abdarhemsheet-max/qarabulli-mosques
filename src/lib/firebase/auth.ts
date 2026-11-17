import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import type { UserProfile } from '../../types/mosque';
import { auth, db, getSecondaryAuth } from './config';
import { handleFirestoreError, OperationType } from './errors';

const BOOTSTRAPPED_ADMIN_EMAIL = 'abdarhemsheet@gmail.com';

export const GOOGLE_WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
];

// Strictly in-memory OAuth access token cache (never stored in localStorage or sessionStorage)
let cachedWorkspaceAccessToken: string | null = null;
const tokenListeners = new Set<(token: string | null) => void>();

function setCachedWorkspaceToken(token: string | null): void {
  cachedWorkspaceAccessToken = token;
  tokenListeners.forEach((listener) => listener(token));
}

export function getWorkspaceAccessToken(): string | null {
  return cachedWorkspaceAccessToken;
}

export function clearWorkspaceAccessToken(): void {
  setCachedWorkspaceToken(null);
}

export function subscribeWorkspaceToken(
  listener: (token: string | null) => void
): () => void {
  tokenListeners.add(listener);
  listener(cachedWorkspaceAccessToken);
  return () => {
    tokenListeners.delete(listener);
  };
}

export function initWorkspaceTokenWatcher(): Unsubscribe {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      setCachedWorkspaceToken(null);
    }
  });
}

function buildWorkspaceProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  for (const scope of GOOGLE_WORKSPACE_SCOPES) {
    provider.addScope(scope);
  }
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export function translateAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code)
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    case 'auth/invalid-email':
      return 'صيغة البريد الإلكتروني غير صالحة.';
    case 'auth/email-already-in-use':
      return 'هذا البريد الإلكتروني مسجّل مسبقاً.';
    case 'auth/weak-password':
      return 'كلمة المرور ضعيفة، يجب أن تتكون من 6 أحرف على الأقل.';
    case 'auth/operation-not-allowed':
      return 'تسجيل الدخول بالبريد وكلمة المرور غير مفعّل في لوحة Firebase بعد. يمكنك الدخول الآن عبر زر Google أعلاه.';
    case 'auth/popup-closed-by-user':
      return 'تم إغلاق نافذة تسجيل الدخول قبل إتمام العملية.';
    case 'auth/popup-blocked':
      return 'منع المتصفح فتح نافذة تسجيل الدخول، يرجى السماح بالنوافذ المنبثقة ثم المحاولة مرة أخرى.';
    case 'auth/too-many-requests':
      return 'محاولات متكررة كثيرة، يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.';
    case 'auth/network-request-failed':
      return 'تعذّر الاتصال بالشبكة، يرجى التحقق من اتصال الإنترنت.';
    default:
      return 'حدث خطأ أثناء المصادقة، يرجى المحاولة مرة أخرى.';
  }
}

export async function signInStaff(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function signInWithGoogle(): Promise<User> {
  const provider = buildWorkspaceProvider();
  const cred = await signInWithPopup(auth, provider);
  const oauthCred = GoogleAuthProvider.credentialFromResult(cred);
  if (oauthCred?.accessToken) {
    setCachedWorkspaceToken(oauthCred.accessToken);
  }
  return cred.user;
}

export async function connectGoogleSheetsAccess(): Promise<string> {
  const provider = buildWorkspaceProvider();
  const currentUser = auth.currentUser;
  const usesGooglePrimary = Boolean(
    currentUser?.providerData.some((p) => p.providerId === 'google.com')
  );

  let cred;
  if (currentUser && usesGooglePrimary) {
    cred = await reauthenticateWithPopup(currentUser, provider);
  } else {
    // Use secondary auth instance so email/password staff keep their primary Awqaf session
    const secondary = getSecondaryAuth();
    cred = await signInWithPopup(secondary, provider);
    await signOut(secondary);
  }

  const oauthCred = GoogleAuthProvider.credentialFromResult(cred);
  if (!oauthCred?.accessToken) {
    throw new Error('تعذّر الحصول على رمز صلاحية Google Sheets.');
  }

  setCachedWorkspaceToken(oauthCred.accessToken);
  return oauthCred.accessToken;
}

export async function signOutStaff(): Promise<void> {
  setCachedWorkspaceToken(null);
  await signOut(auth);
}

export async function sendVerificationEmailToCurrentUser(): Promise<void> {
  if (auth.currentUser) {
    await sendEmailVerification(auth.currentUser);
  }
}

export async function fetchOrBootstrapUserProfile(
  firebaseUser: User
): Promise<{ profile: UserProfile | null; needsVerificationForBootstrap: boolean }> {
  const userPath = `users/${firebaseUser.uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (snap.exists()) {
      const data = snap.data({ serverTimestamps: 'estimate' });
      return {
        profile: {
          uid: String(data.uid),
          name: String(data.name),
          email: String(data.email),
          role: data.role === 'admin' ? 'admin' : 'documenter',
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          createdBy: String(data.createdBy),
        },
        needsVerificationForBootstrap: false,
      };
    }
  } catch (error) {
    // Allow fallback check if permission denied during bootstrap check
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes('permission') && !msg.includes('insufficient')) {
      handleFirestoreError(error, OperationType.GET, userPath);
    }
  }

  // Bootstrap primary admin if matching verified runtime email
  if (firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL) {
    if (!firebaseUser.emailVerified) {
      return { profile: null, needsVerificationForBootstrap: true };
    }

    const displayName =
      firebaseUser.displayName?.trim() || firebaseUser.email.split('@')[0] || 'مدير النظام';
    const newProfilePayload = {
      uid: firebaseUser.uid,
      name: displayName.slice(0, 120),
      email: firebaseUser.email,
      role: 'admin',
      createdAt: serverTimestamp(),
      createdBy: firebaseUser.uid,
    };

    try {
      await setDoc(doc(db, 'users', firebaseUser.uid), newProfilePayload);
      return {
        profile: {
          uid: firebaseUser.uid,
          name: newProfilePayload.name,
          email: newProfilePayload.email,
          role: 'admin',
          createdAt: new Date(),
          createdBy: firebaseUser.uid,
        },
        needsVerificationForBootstrap: false,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }
  }

  return { profile: null, needsVerificationForBootstrap: false };
}

export async function createDocumenterUser(params: {
  name: string;
  email: string;
  tempPassword: string;
  adminUid: string;
}): Promise<UserProfile> {
  const cleanName = params.name.trim().slice(0, 120);
  const cleanEmail = params.email.trim().toLowerCase().slice(0, 254);

  if (!cleanName || !cleanEmail || params.tempPassword.length < 6) {
    throw new Error('يرجى إدخال الاسم والبريد الإلكتروني وكلمة مرور من 6 أحرف على الأقل.');
  }

  const secondaryAuth = getSecondaryAuth();
  const cred = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, params.tempPassword);
  const newUid = cred.user.uid;
  await signOut(secondaryAuth);

  const userPath = `users/${newUid}`;
  const payload = {
    uid: newUid,
    name: cleanName,
    email: cleanEmail,
    role: 'documenter',
    createdAt: serverTimestamp(),
    createdBy: params.adminUid,
  };

  try {
    await setDoc(doc(db, 'users', newUid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, userPath);
  }

  return {
    uid: newUid,
    name: cleanName,
    email: cleanEmail,
    role: 'documenter',
    createdAt: new Date(),
    createdBy: params.adminUid,
  };
}

export function subscribeUsers(
  onData: (users: UserProfile[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: UserProfile[] = snapshot.docs.map((d) => {
        const data = d.data({ serverTimestamps: 'estimate' });
        return {
          uid: String(data.uid ?? d.id),
          name: String(data.name ?? ''),
          email: String(data.email ?? ''),
          role: data.role === 'admin' ? 'admin' : 'documenter',
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          createdBy: String(data.createdBy ?? ''),
        };
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'users');
      } catch (wrapped) {
        if (onError) onError(wrapped as Error);
      }
    }
  );
}
