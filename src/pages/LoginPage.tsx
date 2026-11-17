import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { signInStaff, signOutStaff, translateAuthError } from '../lib/supabase/auth';
import { MosqueMark } from '../components/AppHeader';

interface LoginPageProps {
  authBanner?: { type: 'verify-email' | 'no-profile'; email?: string | null } | null;
}

export function LoginPage({ authBanner }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      await signInStaff(email, password);
    } catch (err) {
      setErrorMsg(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-brand flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-8 text-center text-white">
        <div className="w-20 h-20 rounded-3xl bg-white/10 border border-white/15 text-gold flex items-center justify-center mb-4">
          <MosqueMark className="w-11 h-11" />
        </div>
        <h1 className="text-2xl font-black leading-snug">توثيق المساجد</h1>
        <p className="text-white/70 mt-1">مكتب أوقاف القره بوللي</p>
      </div>

      <div className="bg-white rounded-t-[2rem] px-5 sm:px-8 pt-7 pb-[max(1.5rem,env(safe-area-inset-bottom))] w-full max-w-md mx-auto sm:rounded-3xl sm:mb-10">
        {authBanner?.type === 'no-profile' ? (
          <div className="space-y-4 text-center">
            <p className="text-lg font-extrabold text-ink">الحساب غير مفعّل</p>
            <p className="text-sm text-muted leading-relaxed">
              تم الدخول بالبريد <span dir="ltr" className="font-bold text-ink">{authBanner.email}</span> لكنه غير مضاف
              في قائمة الموظفين. راجع مدير المكتب.
            </p>
            <button type="button" onClick={() => void signOutStaff()} className="btn-outline w-full h-12">
              الدخول بحساب آخر
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <h2 className="text-xl font-extrabold text-ink">تسجيل الدخول</h2>

            {errorMsg && <p className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm p-3">{errorMsg}</p>}

            <div>
              <label htmlFor="login-email" className="label">
                البريد الإلكتروني
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 text-muted absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="field pr-11 text-left"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="label">
                كلمة المرور
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-muted absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field pr-11 pl-12 text-left"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg text-muted flex items-center justify-center"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full h-13 py-3.5 text-base">
              {loading ? 'جارٍ الدخول...' : 'دخول'}
            </button>

            <p className="text-center text-xs text-muted pt-1">الحسابات يضيفها مدير المكتب من شاشة الإدارة</p>
          </form>
        )}
      </div>
    </div>
  );
}
