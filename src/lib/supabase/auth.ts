import type { User } from '@supabase/supabase-js';
import type { UserProfile } from '../../types/mosque';
import { createProvisioningClient, isSupabaseConfigured, supabase } from './client';
import { handleDbError, OperationType } from './errors';

export type StaffUser = User;
export type Unsubscribe = () => void;

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string | null;
  created_by: string;
}

function mapProfile(row: ProfileRow): UserProfile {
  return {
    uid: String(row.id),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    role: row.role === 'admin' ? 'admin' : 'documenter',
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    createdBy: String(row.created_by ?? ''),
  };
}

function uniqueChannel(name: string): string {
  return `${name}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function translateAuthError(error: unknown): string {
  const e = (typeof error === 'object' && error !== null ? error : {}) as {
    code?: string;
    message?: string;
    status?: number;
  };
  const code = String(e.code ?? '');
  const message = String(e.message ?? '');

  if (!isSupabaseConfigured) {
    return 'لم يتم ربط التطبيق بقاعدة بيانات Supabase بعد.';
  }

  switch (code) {
    case 'invalid_credentials':
      return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    case 'email_not_confirmed':
      return 'لم يتم تأكيد البريد الإلكتروني لهذا الحساب بعد. يرجى مراجعة مدير المكتب.';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'صيغة البريد الإلكتروني غير صالحة.';
    case 'user_already_exists':
    case 'email_exists':
      return 'هذا البريد الإلكتروني مسجّل مسبقاً.';
    case 'weak_password':
      return 'كلمة المرور ضعيفة، يجب أن تتكون من 6 أحرف على الأقل.';
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'إنشاء الحسابات بالبريد غير مفعّل في إعدادات Supabase.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'محاولات متكررة كثيرة، يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.';
    default:
      break;
  }

  if (/invalid login credentials/i.test(message)) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  }
  if (/failed to fetch|network/i.test(message)) {
    return 'تعذّر الاتصال بالشبكة، يرجى التحقق من اتصال الإنترنت.';
  }
  if (error instanceof Error && /[؀-ۿ]/.test(error.message)) {
    return error.message;
  }
  return 'حدث خطأ أثناء المصادقة، يرجى المحاولة مرة أخرى.';
}

export function onStaffAuthChange(callback: (user: StaffUser | null) => void): Unsubscribe {
  let lastUserId: string | null | undefined;

  const emit = (user: StaffUser | null) => {
    // Supabase also fires TOKEN_REFRESHED etc.; only react to real identity changes.
    const id = user?.id ?? null;
    if (id === lastUserId) return;
    lastUserId = id;
    // Defer so Supabase calls made by the callback don't run inside the auth lock.
    setTimeout(() => callback(user), 0);
  };

  void supabase.auth.getSession().then(({ data }) => emit(data.session?.user ?? null));

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    emit(session?.user ?? null);
  });

  return () => data.subscription.unsubscribe();
}

export async function getCurrentStaffUser(): Promise<StaffUser | null> {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function signInStaff(email: string, password: string): Promise<StaffUser> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  return data.user;
}

export async function signOutStaff(): Promise<void> {
  await supabase.auth.signOut();
}

export async function sendVerificationEmailToCurrentUser(): Promise<void> {
  const user = await getCurrentStaffUser();
  if (!user?.email) return;
  const { error } = await supabase.auth.resend({ type: 'signup', email: user.email });
  if (error) throw error;
}

export async function fetchOrBootstrapUserProfile(
  user: StaffUser
): Promise<{ profile: UserProfile | null; needsVerificationForBootstrap: boolean }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, created_at, created_by')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    handleDbError(error, OperationType.GET, `profiles/${user.id}`);
  }

  return {
    profile: data ? mapProfile(data as ProfileRow) : null,
    needsVerificationForBootstrap: false,
  };
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

  const provisioning = createProvisioningClient();
  const { data, error } = await provisioning.auth.signUp({
    email: cleanEmail,
    password: params.tempPassword,
    options: { data: { name: cleanName } },
  });
  if (error) throw error;

  const newUid = data.user?.id;
  // When the email already exists Supabase returns a user with no identities.
  if (!newUid || (data.user?.identities && data.user.identities.length === 0)) {
    throw Object.assign(new Error('هذا البريد الإلكتروني مسجّل مسبقاً.'), {
      code: 'user_already_exists',
    });
  }

  const { data: inserted, error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: newUid,
      name: cleanName,
      email: cleanEmail,
      role: 'documenter',
      created_by: params.adminUid,
    })
    .select('id, name, email, role, created_at, created_by')
    .single();

  if (insertError) {
    handleDbError(insertError, OperationType.CREATE, `profiles/${newUid}`);
  }

  return mapProfile(inserted as ProfileRow);
}

export function subscribeUsers(
  onData: (users: UserProfile[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  let active = true;

  const load = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, created_at, created_by')
      .order('created_at', { ascending: false });
    if (!active) return;
    if (error) {
      try {
        handleDbError(error, OperationType.LIST, 'profiles');
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
      return;
    }
    onData((data ?? []).map((row) => mapProfile(row as ProfileRow)));
  };

  void load();

  const channel = supabase
    .channel(uniqueChannel('profiles'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
      void load();
    })
    .subscribe();

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}
