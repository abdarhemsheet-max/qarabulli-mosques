import { useState } from 'react';
import { CheckCircle2, ExternalLink, Globe, RefreshCw, Send } from 'lucide-react';
import type { MosqueRecord, OsmSettings, UserProfile } from '../types/mosque';
import { markOsmPublished } from '../lib/supabase/mosques';
import { isOsmPublishingConfigured, mosqueOsmTags, osmElementUrl, publishMosqueToOsm } from '../lib/osm/osmPublish';
import { formatEnglishDateTime } from '../lib/utils/geo';
import { MapStatusBadge } from './ui/MapStatusBadge';

interface OsmPublishCardProps {
  /** Latest saved record (status, osmId, names). */
  mosque: MosqueRecord | null;
  currentUser: UserProfile;
  osmSettings: OsmSettings;
}

/**
 * Publishing to OpenStreetMap: free, open, and — unlike Google — directly
 * through the API. Published mosques appear on openstreetmap.org and in free
 * map apps that use it (Organic Maps, OsmAnd, Maps.me...).
 */
export function OsmPublishCard({ mosque, currentUser, osmSettings }: OsmPublishCardProps) {
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [done, setDone] = useState<{ url: string; action: 'created' | 'updated' } | null>(null);

  if (!mosque) {
    return <section className="rounded-2xl bg-sand border border-line p-3.5 text-sm text-muted">جارٍ تجهيز البطاقة...</section>;
  }

  const configured = isOsmPublishingConfigured();
  const canPublish = currentUser.role === 'admin' || osmSettings.osmPublishEnabled;
  const elementUrl = osmElementUrl(mosque.osmId);
  const status = done ? 'published' : mosque.mapStatus;

  const publish = async () => {
    setErrorMsg('');
    setBusy(true);
    try {
      const res = await publishMosqueToOsm(mosque);
      await markOsmPublished(mosque.id, res.osmId);
      setDone({ url: res.elementUrl, action: res.action });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذّر النشر.');
    } finally {
      setBusy(false);
    }
  };

  const tags = mosqueOsmTags(mosque);

  return (
    <section className="rounded-2xl bg-sand border border-line p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-white border border-line flex items-center justify-center">
            <Globe className="w-4 h-4 text-brand" />
          </span>
          <h3 className="font-extrabold text-ink">الخريطة المفتوحة</h3>
        </div>
        <MapStatusBadge status={status} />
      </div>

      {done ? (
        <div className="rounded-xl bg-white border border-brand/20 p-3 flex items-start gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-brand shrink-0 mt-0.5" />
          <p className="text-sm text-ink">
            {done.action === 'created' ? 'أُضيف المسجد إلى OpenStreetMap.' : 'تم تحديث المسجد في OpenStreetMap.'} يظهر
            للجميع خلال دقائق.
          </p>
        </div>
      ) : (
        <p className="text-[13px] text-ink/75 leading-relaxed">
          {status === 'published'
            ? `نشره ${mosque.osmPublishedByName || '—'}${mosque.osmPublishedAt ? ` · ${formatEnglishDateTime(mosque.osmPublishedAt)}` : ''}`
            : status === 'linked'
              ? 'المسجد موجود في الخريطة المفتوحة لكن باسم أو بيانات ناقصة. انشر بياناتنا لتحديثه.'
              : 'انشر المسجد في الخريطة المفتوحة (OpenStreetMap) ليظهر في تطبيقات الخرائط المجانية مثل Organic Maps و OsmAnd.'}
        </p>
      )}

      {canPublish && configured && !done && (
        <>
          <div className="rounded-xl bg-white border border-line p-2.5 text-xs text-muted" dir="ltr">
            {Object.entries(tags).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-0.5">
                <span className="font-mono">{k}</span>
                <span className="font-bold text-ink truncate">{v}</span>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => void publish()} disabled={busy} className="btn-primary w-full h-12">
            {status === 'none' ? <Send className="w-4 h-4 text-gold" /> : <RefreshCw className="w-4 h-4 text-gold" />}
            {busy ? 'جارٍ النشر...' : status === 'none' ? 'نشر في الخريطة' : 'تحديث في الخريطة'}
          </button>
        </>
      )}

      {canPublish && !configured && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
          النشر يحتاج ربط حساب المكتب في OpenStreetMap مرة واحدة (مجاني).
        </p>
      )}

      {(done?.url || elementUrl) && (
        <a
          href={done?.url || elementUrl!}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-outline w-full h-11 text-sm"
        >
          <ExternalLink className="w-4 h-4" />
          عرض المسجد في OpenStreetMap
        </a>
      )}

      {errorMsg && <p className="text-xs text-red-700">{errorMsg}</p>}
    </section>
  );
}
