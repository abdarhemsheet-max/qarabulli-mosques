import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ChevronDown, Download, Globe, UserPlus } from 'lucide-react';
import type { MosqueRecord, OsmSettings, UserProfile } from '../types/mosque';
import { createDocumenterUser, subscribeUsers, translateAuthError } from '../lib/supabase/auth';
import { saveOsmSettings } from '../lib/supabase/settings';
import { exportExcel } from '../lib/export/lazyExport';
import { timeAgoArabic } from '../lib/utils/geo';
import { getOsmRedirectUri, isOsmPublishingConfigured } from '../lib/osm/osmPublish';

interface AdminPageProps {
  mosques: MosqueRecord[];
  currentUser: UserProfile;
  osmSettings: OsmSettings;
}

const DAY = 24 * 60 * 60 * 1000;

function Stat({ label, value, accent = false }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${accent ? 'bg-brand text-white' : 'card'}`}>
      <p className={`text-xs font-semibold ${accent ? 'text-white/75' : 'text-muted'}`}>{label}</p>
      <p className={`text-3xl font-black tabular-nums mt-1 ${accent ? 'text-white' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

export function AdminPage({ mosques, currentUser, osmSettings }: AdminPageProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => subscribeUsers(setUsers, (e) => setMsg({ ok: false, text: e.message })), []);

  const stats = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    let today = 0;
    let week = 0;
    const map = { none: 0, linked: 0, published: 0 };
    const byUser = new Map<string, { name: string; total: number; week: number; last: Date | null }>();
    const byLocality = new Map<string, number>();
    let withPhotos = 0;

    mosques.forEach((m) => {
      const t = m.createdAt?.getTime() ?? 0;
      if (t >= startOfToday.getTime()) today += 1;
      if (now - t <= 7 * DAY) week += 1;
      map[m.mapStatus] += 1;
      if (m.photos.length > 0) withPhotos += 1;
      const u = byUser.get(m.createdBy) ?? { name: m.createdByName, total: 0, week: 0, last: null };
      u.total += 1;
      if (now - t <= 7 * DAY) u.week += 1;
      if (!u.last || (m.createdAt && m.createdAt > u.last)) u.last = m.createdAt;
      byUser.set(m.createdBy, u);
      const l = m.locality.trim() || 'غير محدد';
      byLocality.set(l, (byLocality.get(l) ?? 0) + 1);
    });

    return {
      today,
      week,
      map,
      withPhotos,
      byUser: [...byUser.entries()].sort((a, b) => b[1].total - a[1].total),
      byLocality: [...byLocality.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [mosques]);

  const total = mosques.length;
  const osmConfigured = isOsmPublishingConfigured();
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  const addUser = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const created = await createDocumenterUser({ name, email, tempPassword: password, adminUid: currentUser.uid });
      setMsg({
        ok: true,
        text: `تمت إضافة «${created.name}». أعطه البريد وكلمة المرور ليدخل من هاتفه.`,
      });
      setName('');
      setEmail('');
      setPassword('');
      setFormOpen(false);
    } catch (err) {
      setMsg({
        ok: false,
        text:
          typeof err === 'object' && err !== null && 'code' in err
            ? translateAuthError(err)
            : err instanceof Error
              ? err.message
              : 'تعذّر إنشاء الحساب.',
      });
    } finally {
      setBusy(false);
    }
  };

  const toggleOsm = async (patch: Partial<OsmSettings>) => {
    try {
      await saveOsmSettings({ ...osmSettings, ...patch }, currentUser);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'تعذّر الحفظ.' });
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-3 sm:px-5 py-4 space-y-5 pb-8">
        {/* Overview */}
        <section className="grid grid-cols-2 gap-2.5">
          <Stat label="إجمالي المساجد الموثّقة" value={total} accent />
          <Stat label="خلال 7 أيام" value={stats.week} />
          <Stat label="اليوم" value={stats.today} />
          <Stat label="بصور" value={`${pct(stats.withPhotos)}%`} />
        </section>

        <button
          type="button"
          onClick={() => void exportExcel(mosques)}
          disabled={total === 0}
          className="btn-gold w-full h-14 text-base shadow-sm"
        >
          <Download className="w-5 h-5" />
          تنزيل تقرير Excel الكامل
        </button>

        {/* Open map progress */}
        <section className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-ink">النشر في الخريطة المفتوحة</h2>
            <span className="text-sm font-bold text-brand tabular-nums">{pct(stats.map.published)}% منشور</span>
          </div>
          <div className="h-3 rounded-full bg-sand overflow-hidden flex">
            <div className="bg-brand" style={{ width: `${pct(stats.map.published)}%` }} />
            <div className="bg-amber-400" style={{ width: `${pct(stats.map.linked)}%` }} />
          </div>
          <div className="grid grid-cols-3 text-center text-xs">
            <div>
              <p className="text-lg font-black text-brand tabular-nums">{stats.map.published}</p>
              <p className="text-muted">منشور</p>
            </div>
            <div>
              <p className="text-lg font-black text-amber-600 tabular-nums">{stats.map.linked}</p>
              <p className="text-muted">يحتاج تحديث</p>
            </div>
            <div>
              <p className="text-lg font-black text-muted tabular-nums">{stats.map.none}</p>
              <p className="text-muted">غير منشور</p>
            </div>
          </div>
        </section>

        {/* Team activity */}
        <section className="card overflow-hidden">
          <h2 className="font-extrabold text-ink px-4 pt-4 pb-2">عمل الموثِّقين</h2>
          {stats.byUser.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted">لا توجد توثيقات بعد.</p>
          ) : (
            <div className="divide-y divide-line/70">
              {stats.byUser.map(([uid, u]) => (
                <div key={uid} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-brand-soft text-brand font-black flex items-center justify-center shrink-0">
                    {u.name.trim().charAt(0) || '؟'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-ink truncate">{u.name}</p>
                    <p className="text-xs text-muted">آخر توثيق {timeAgoArabic(u.last)}</p>
                  </div>
                  <div className="text-left tabular-nums">
                    <p className="font-black text-ink">{u.total}</p>
                    <p className="text-[11px] text-muted">+{u.week} هذا الأسبوع</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Localities */}
        {stats.byLocality.length > 0 && (
          <section className="card p-4">
            <h2 className="font-extrabold text-ink mb-3">حسب المحلة</h2>
            <div className="space-y-2">
              {stats.byLocality.slice(0, 12).map(([l, n]) => (
                <div key={l} className="flex items-center gap-3 text-sm">
                  <span className="w-28 truncate text-ink">{l}</span>
                  <div className="flex-1 h-2 rounded-full bg-sand overflow-hidden">
                    <div className="h-full bg-brand/70" style={{ width: `${Math.max(4, (n / stats.byLocality[0][1]) * 100)}%` }} />
                  </div>
                  <span className="w-8 text-left tabular-nums font-bold text-ink">{n}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Users */}
        <section className="card overflow-hidden">
          <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2">
            <h2 className="font-extrabold text-ink">الموظفون ({users.length})</h2>
            <button type="button" onClick={() => setFormOpen((v) => !v)} className="btn-primary h-10 px-3.5 text-sm">
              <UserPlus className="w-4 h-4 text-gold" />
              إضافة موثِّق
            </button>
          </div>

          {msg && (
            <p
              className={`mx-4 mb-3 rounded-xl p-3 text-sm ${
                msg.ok ? 'bg-brand-soft text-brand border border-brand/20' : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {msg.text}
            </p>
          )}

          {formOpen && (
            <form onSubmit={addUser} className="mx-4 mb-4 p-3.5 rounded-2xl bg-sand border border-line space-y-3">
              <div>
                <label htmlFor="u-name" className="label">
                  الاسم
                </label>
                <input id="u-name" className="field" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label htmlFor="u-email" className="label">
                  البريد الإلكتروني
                </label>
                <input
                  id="u-email"
                  className="field text-left"
                  dir="ltr"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </div>
              <div>
                <label htmlFor="u-pass" className="label">
                  كلمة المرور
                </label>
                <div className="flex gap-2">
                  <input
                    id="u-pass"
                    className="field text-left"
                    dir="ltr"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setPassword(generatePassword())} className="btn-outline h-12 px-3 text-sm shrink-0">
                    توليد
                  </button>
                </div>
              </div>
              <button type="submit" disabled={busy} className="btn-primary w-full h-12">
                {busy ? 'جارٍ الإنشاء...' : 'إنشاء الحساب'}
              </button>
            </form>
          )}

          <div className="divide-y divide-line/70 border-t border-line/70">
            {users.map((u) => {
              const count = mosques.filter((m) => m.createdBy === u.uid).length;
              return (
                <div key={u.uid} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-ink truncate">
                      {u.name}{' '}
                      <span className={`text-[11px] font-bold ${u.role === 'admin' ? 'text-gold' : 'text-muted'}`}>
                        {u.role === 'admin' ? 'مدير' : 'موثِّق'}
                      </span>
                    </p>
                    <p className="text-xs text-muted truncate" dir="ltr">
                      {u.email}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-ink tabular-nums">{count} مسجد</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Advanced */}
        <section className="card overflow-hidden">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full px-4 h-14 flex items-center justify-between font-bold text-ink"
          >
            <span className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted" />
              الخريطة المفتوحة (OpenStreetMap)
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  osmConfigured ? 'bg-brand-soft text-brand' : 'bg-amber-50 text-amber-800'
                }`}
              >
                {osmConfigured ? 'مربوط' : 'غير مربوط'}
              </span>
            </span>
            <ChevronDown className={`w-5 h-5 text-muted transition ${advancedOpen ? 'rotate-180' : ''}`} />
          </button>
          {advancedOpen && (
            <div className="px-4 pb-4 space-y-3 text-sm">
              {!osmConfigured && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2 text-ink">
                  <p className="font-bold">ربط حساب المكتب (مرة واحدة، مجاني)</p>
                  <ol className="list-decimal pr-5 space-y-1 text-[13px] leading-relaxed">
                    <li>أنشئ حساباً للمكتب في openstreetmap.org.</li>
                    <li>الإعدادات ← تطبيقات OAuth 2 ← تسجيل تطبيق جديد.</li>
                    <li>
                      رابط العودة:
                      <span dir="ltr" className="block font-mono text-xs bg-white rounded px-2 py-1 mt-1 break-all">
                        {getOsmRedirectUri()}
                      </span>
                    </li>
                    <li>ألغِ «تطبيق سرّي»، واختر صلاحية «تعديل الخريطة»، ثم أرسل «معرّف العميل» للمطوّر.</li>
                  </ol>
                </div>
              )}
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-sand border border-line">
                <span>
                  <span className="block font-bold text-ink">السماح للموثِّقين بالنشر</span>
                  <span className="block text-xs text-muted">المدير يستطيع النشر دائماً</span>
                </span>
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-[#0f4c3a]"
                  checked={osmSettings.osmPublishEnabled}
                  onChange={(e) => void toggleOsm({ osmPublishEnabled: e.target.checked })}
                />
              </label>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
