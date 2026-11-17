import { useEffect, useState, type FormEvent } from 'react';
import { Globe, UserPlus, Users } from 'lucide-react';
import {
  createDocumenterUser,
  subscribeUsers,
  translateAuthError,
} from '../lib/firebase/auth';
import { DEFAULT_OSM_SETTINGS, saveOsmSettings } from '../lib/firebase/settings';
import { getOsmClientId, getOsmRedirectUri } from '../lib/osm/osmPublish';
import { formatEnglishDate } from '../lib/utils/geo';
import type { OsmSettings, UserProfile } from '../types/mosque';

interface UsersPageProps {
  currentUser: UserProfile;
  osmSettings?: OsmSettings;
}

export function UsersPage({
  currentUser,
  osmSettings = DEFAULT_OSM_SETTINGS,
}: UsersPageProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [savingOsm, setSavingOsm] = useState(false);
  const [osmStatusMsg, setOsmStatusMsg] = useState('');

  useEffect(() => {
    const unsub = subscribeUsers(
      (list) => setUsers(list),
      (err) => setErrorMsg(err.message)
    );
    return () => unsub();
  }, []);

  if (currentUser.role !== 'admin') {
    return (
      <div className="max-w-lg mx-auto p-6 text-center text-sm text-red-700">
        هذه الشاشة مخصصة لمدير المكتب فقط.
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);

    try {
      const created = await createDocumenterUser({
        name,
        email,
        tempPassword,
        adminUid: currentUser.uid,
      });
      setSuccessMsg(`تمت إضافة الموثِّق «${created.name}» بنجاح.`);
      setName('');
      setEmail('');
      setTempPassword('');
    } catch (err) {
      if (typeof err === 'object' && err !== null && 'code' in err) {
        setErrorMsg(translateAuthError(err));
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'تعذّر إنشاء الحساب.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 pb-20 space-y-6">
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-[#0F4C3A] flex items-center gap-2">
          <Users className="w-5 h-5 text-[#C9A24B]" />
          <span>إدارة المستخدمين</span>
        </h1>
        <p className="text-sm text-[#5A6561] mt-1">
          إضافة موثِّق جديد بحساب بريد إلكتروني وكلمة مرور مؤقتة.
        </p>
      </div>

      {/* Add Documenter Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-[#E5E2D9] rounded-2xl p-5 space-y-4"
      >
        <h2 className="text-base font-bold text-[#1A2421] flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-[#0F4C3A]" />
          <span>إضافة موثِّق جديد</span>
        </h2>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">
            {successMsg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="new-user-name" className="block text-xs font-bold text-[#1A2421] mb-1">
              الاسم الكامل
            </label>
            <input
              id="new-user-name"
              type="text"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="الاسم الثلاثي"
              className="w-full h-11 px-3 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-sm focus:outline-none focus:border-[#0F4C3A] focus:bg-white"
            />
          </div>

          <div>
            <label htmlFor="new-user-email" className="block text-xs font-bold text-[#1A2421] mb-1">
              البريد الإلكتروني
            </label>
            <input
              id="new-user-email"
              type="email"
              required
              dir="ltr"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@awqaf.ly"
              className="w-full h-11 px-3 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-sm text-left focus:outline-none focus:border-[#0F4C3A] focus:bg-white"
            />
          </div>

          <div>
            <label htmlFor="new-user-pass" className="block text-xs font-bold text-[#1A2421] mb-1">
              كلمة مرور مؤقتة
            </label>
            <input
              id="new-user-pass"
              type="text"
              required
              minLength={6}
              dir="ltr"
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              placeholder="6 أحرف على الأقل"
              className="w-full h-11 px-3 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-sm text-left focus:outline-none focus:border-[#0F4C3A] focus:bg-white"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="min-h-[44px] px-5 rounded-xl bg-[#0F4C3A] text-white font-bold text-sm hover:bg-[#0B3A2C] disabled:opacity-60 transition"
        >
          {submitting ? 'جاري إضافة الموثِّق...' : 'إضافة الموثِّق'}
        </button>
      </form>

      {/* Staff List */}
      <div className="bg-white border border-[#E5E2D9] rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#EFECE4] flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#1A2421] tabular-nums">
            الموظفون المسجلون ({users.length})
          </h2>
        </div>

        <div className="divide-y divide-[#EFECE4]">
          {users.map((u) => (
            <div
              key={u.uid}
              className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
            >
              <div>
                <p className="text-sm font-bold text-[#1A2421]">{u.name}</p>
                <p dir="ltr" className="text-xs text-[#5A6561] text-right sm:text-left">
                  {u.email}
                </p>
              </div>
              <div className="text-xs text-[#5A6561] tabular-nums flex items-center gap-2">
                <span className="font-semibold text-[#0F4C3A]">
                  {u.role === 'admin' ? 'مدير' : 'موثِّق'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{formatEnglishDate(u.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manager-Only Hidden-by-Default OpenStreetMap Publishing Settings */}
      <section className="bg-white border border-[#E5E2D9] rounded-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#0F4C3A] flex items-center gap-2">
              <Globe className="w-4 h-4 text-[#C9A24B]" />
              <span>إعدادات النشر إلى OpenStreetMap (اختياري للمدير)</span>
            </h2>
            <p className="text-xs text-[#5A6561] mt-1 leading-relaxed">
              هذا الخيار مخفي افتراضياً عن الموظفين. عند تفعيله يظهر زر «نشر إلى OpenStreetMap» داخل بطاقة المسجد لإرسال التعديلات عبر OAuth 2.0.
            </p>
          </div>
        </div>

        {osmStatusMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
            {osmStatusMsg}
          </div>
        )}

        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#FAF8F4] border border-[#EFECE4] cursor-pointer">
            <div>
              <span className="block text-sm font-bold text-[#1A2421]">
                إظهار زر «نشر إلى OpenStreetMap»
              </span>
              <span className="block text-xs text-[#5A6561] mt-0.5">
                {osmSettings.osmPublishEnabled ? 'مُفعّل حالياً لجميع الموظفين' : 'مخفي افتراضياً'}
              </span>
            </div>
            <input
              type="checkbox"
              disabled={savingOsm}
              checked={osmSettings.osmPublishEnabled}
              onChange={(e) => {
                const enabled = e.target.checked;
                setSavingOsm(true);
                setOsmStatusMsg('');
                void saveOsmSettings(
                  { ...osmSettings, osmPublishEnabled: enabled },
                  currentUser
                )
                  .then(() =>
                    setOsmStatusMsg(
                      enabled
                        ? 'تم تفعيل زر «نشر إلى OpenStreetMap».'
                        : 'تم إخفاء زر «نشر إلى OpenStreetMap».'
                    )
                  )
                  .finally(() => setSavingOsm(false));
              }}
              className="w-5 h-5 accent-[#0F4C3A]"
            />
          </label>

          {osmSettings.osmPublishEnabled && (
            <div className="p-3.5 rounded-xl bg-[#FAF8F4] border border-[#EFECE4] space-y-3">
              <p className="text-xs font-bold text-[#1A2421]">الخادم المستهدف للنشر:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={savingOsm}
                  onClick={() => {
                    setSavingOsm(true);
                    setOsmStatusMsg('');
                    void saveOsmSettings(
                      { ...osmSettings, osmUseProduction: false },
                      currentUser
                    )
                      .then(() => setOsmStatusMsg('تم ضبط النشر على الخادم التجريبي (Sandbox).'))
                      .finally(() => setSavingOsm(false));
                  }}
                  className={`p-3 rounded-xl border text-right transition ${
                    !osmSettings.osmUseProduction
                      ? 'bg-white border-[#0F4C3A] ring-1 ring-[#0F4C3A]'
                      : 'bg-white/60 border-[#D8D4C8] text-[#5A6561]'
                  }`}
                >
                  <span className="block text-xs font-bold text-[#0F4C3A]">
                    الخادم التجريبي (افتراضي)
                  </span>
                  <span dir="ltr" className="block text-[11px] font-mono text-[#5A6561] mt-0.5 truncate">
                    master.apis.dev.openstreetmap.org
                  </span>
                </button>

                <button
                  type="button"
                  disabled={savingOsm}
                  onClick={() => {
                    setSavingOsm(true);
                    setOsmStatusMsg('');
                    void saveOsmSettings(
                      { ...osmSettings, osmUseProduction: true },
                      currentUser
                    )
                      .then(() => setOsmStatusMsg('تم تفعيل النشر على خادم OpenStreetMap الحقيقي.'))
                      .finally(() => setSavingOsm(false));
                  }}
                  className={`p-3 rounded-xl border text-right transition ${
                    osmSettings.osmUseProduction
                      ? 'bg-amber-50 border-amber-500 ring-1 ring-amber-500'
                      : 'bg-white/60 border-[#D8D4C8] text-[#5A6561]'
                  }`}
                >
                  <span className="block text-xs font-bold text-amber-900">
                    الخادم الحقيقي (العالمي)
                  </span>
                  <span dir="ltr" className="block text-[11px] font-mono text-[#5A6561] mt-0.5 truncate">
                    www.openstreetmap.org
                  </span>
                </button>
              </div>

              <div className="text-[11px] text-[#5A6561] space-y-1 pt-1">
                <p>
                  حالة معرف العميل في متغيرات البيئة:{' '}
                  <strong className={getOsmClientId(osmSettings.osmUseProduction) ? 'text-[#0F4C3A]' : 'text-amber-800'}>
                    {getOsmClientId(osmSettings.osmUseProduction)
                      ? 'مُضبوط وجاهز'
                      : osmSettings.osmUseProduction
                        ? 'غير مُضبوط (أضف VITE_OSM_PROD_CLIENT_ID في متغيرات البيئة)'
                        : 'غير مُضبوط (أضف VITE_OSM_SANDBOX_CLIENT_ID في متغيرات البيئة)'}
                  </strong>
                </p>
                <p>
                  رابط العودة (Redirect URI):{' '}
                  <span dir="ltr" className="font-mono select-all text-[#1A2421]">
                    {getOsmRedirectUri()}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
