import { useState, type FormEvent } from 'react';
import { Lock, Mail, RefreshCw } from 'lucide-react';
import {
  sendVerificationEmailToCurrentUser,
  signInStaff,
  signOutStaff,
  translateAuthError,
} from '../lib/supabase/auth';

interface LoginPageProps {
  authBanner?: {
    type: 'verify-email' | 'no-profile';
    email?: string | null;
  } | null;
  onRefreshProfile?: () => Promise<void>;
}

export function LoginPage({ authBanner, onRefreshProfile }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
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

  const handleResendVerification = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      await sendVerificationEmailToCurrentUser();
      setVerificationSent(true);
    } catch (err) {
      setErrorMsg(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F4] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-[#E5E2D9] rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
        {/* Emblem & Title */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#0F4C3A] text-[#C9A24B] flex items-center justify-center shadow-xs">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 2L14 5H10L12 2Z" fill="currentColor" />
              <path d="M5 12C5 8.13401 8.13401 5 12 5C15.866 5 19 8.13401 19 12V20H5V12Z" />
              <path d="M9 20V15C9 13.3431 10.3431 12 12 12C13.6569 12 15 13.3431 15 15V20" />
            </svg>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F4C3A]">
            توثيق مساجد مكتب أوقاف القره بوللي
          </h1>
          <p className="text-sm text-[#5A6561]">
            تسجيل دخول الموظفين المعتمدين للتوثيق الميداني
          </p>
        </div>

        {/* Account verification or missing profile notice */}
        {authBanner?.type === 'verify-email' && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 space-y-3 text-sm">
            <p className="font-bold text-[#1A2421]">يرجى تأكيد البريد الإلكتروني للمدير</p>
            <p className="text-[#4A5552] leading-relaxed">
              تم تسجيل الدخول بالحساب <span className="font-semibold">{authBanner.email}</span>. لتفعيل صلاحيات المدير تلقائياً، أرسل رابط التفعيل إلى بريدك ثم اضغط «تحقق من التفعيل».
            </p>
            {verificationSent && (
              <p className="text-xs font-semibold text-[#0F4C3A]">
                تم إرسال رابط التفعيل، يرجى فتحه من بريدك الإلكتروني.
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => void handleResendVerification()}
                disabled={loading}
                className="flex-1 min-h-[42px] px-3 rounded-xl bg-[#0F4C3A] text-white font-semibold text-xs hover:bg-[#0B3A2C]"
              >
                إرسال رابط التفعيل
              </button>
              <button
                type="button"
                onClick={() => void onRefreshProfile?.()}
                disabled={loading}
                className="flex-1 min-h-[42px] px-3 rounded-xl bg-white border border-[#D8D4C8] text-[#1A2421] font-semibold text-xs flex items-center justify-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>تحقق من التفعيل</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => void signOutStaff()}
              className="w-full text-xs text-[#5A6561] hover:underline pt-1"
            >
              تسجيل الدخول بحساب آخر
            </button>
          </div>
        )}

        {authBanner?.type === 'no-profile' && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-2.5 text-sm text-red-900">
            <p className="font-bold">الحساب غير مفعّل في دليل الموظفين</p>
            <p className="text-xs leading-relaxed">
              تم التحقق من بيانات الدخول ({authBanner.email})، لكن لا يوجد سجل صلاحية لهذا الحساب في قاعدة البيانات. يرجى مراجعة مدير المكتب لإضافة الحساب.
            </p>
            <button
              type="button"
              onClick={() => void signOutStaff()}
              className="text-xs font-bold underline"
            >
              تسجيل الخروج
            </button>
          </div>
        )}

        {!authBanner && (
          <div className="space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-sm font-bold text-[#1A2421] mb-1.5">
                  البريد الإلكتروني
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#5A6561] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-email"
                    type="email"
                    required
                    autoComplete="email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full h-12 pr-10 pl-3.5 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-sm text-left focus:outline-none focus:border-[#0F4C3A] focus:bg-white transition"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="block text-sm font-bold text-[#1A2421] mb-1.5">
                  كلمة المرور
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#5A6561] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-12 pr-10 pl-3.5 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-sm text-left focus:outline-none focus:border-[#0F4C3A] focus:bg-white transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl bg-[#0F4C3A] text-white font-bold text-base hover:bg-[#0B3A2C] active:scale-[0.99] disabled:opacity-60 transition"
              >
                {loading ? 'جاري تسجيل الدخول...' : 'دخول بالبريد وكلمة المرور'}
              </button>
            </form>
          </div>
        )}

        <p className="text-center text-xs text-[#5A6561] pt-2 border-t border-[#EFECE4]">
          الحسابات تُنشأ وتُدار من قِبل مدير مكتب الأوقاف فقط
        </p>
      </div>
    </div>
  );
}
