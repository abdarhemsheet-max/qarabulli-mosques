import { useState } from 'react';
import { Check, CheckCircle2, ChevronDown, Copy, ExternalLink, ImageUp, RotateCcw, Send } from 'lucide-react';
import type { GoogleMapsStatus, MosqueRecord } from '../types/mosque';
import { setGoogleMapsStatus } from '../lib/supabase/mosques';
import { formatEnglishDateTime, generateGoogleMapsSearchUrl } from '../lib/utils/geo';
import { GoogleStatusBadge } from './ui/GoogleStatusBadge';

export interface GoogleMapsPublishSubject {
  id: string;
  officialName: string;
  lat: number;
  lng: number;
  photos: string[];
  googlePlaceId?: string;
}

interface GoogleMapsPublishCardProps {
  subject: GoogleMapsPublishSubject;
  /** Latest record from the database (for the saved status), when available. */
  liveRecord?: MosqueRecord | null;
}

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}

function Step({ n, done }: { n: number; done?: boolean }) {
  return (
    <span
      className={`w-7 h-7 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0 ${
        done ? 'bg-brand text-white' : 'bg-white text-brand border border-brand/30'
      }`}
    >
      {done ? <Check className="w-4 h-4" /> : n}
    </span>
  );
}

export function GoogleMapsPublishCard({ subject, liveRecord }: GoogleMapsPublishCardProps) {
  const [copied, setCopied] = useState(false);
  const [opened, setOpened] = useState(false);
  const [shared, setShared] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [optimistic, setOptimistic] = useState<GoogleMapsStatus | null>(null);

  const status: GoogleMapsStatus = optimistic ?? liveRecord?.googleMapsStatus ?? 'not_submitted';
  const by = liveRecord?.googleMapsSubmittedByName ?? '';
  const at = liveRecord?.googleMapsSubmittedAt ?? null;
  const googleUrl = generateGoogleMapsSearchUrl(subject.lat, subject.lng, subject.googlePlaceId);

  const canSharePhotos =
    subject.photos.length > 0 &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function';

  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(subject.officialName);
      setCopied(true);
    } catch {
      // clipboard blocked: the name is visible on screen anyway
    }
  };

  const sharePhotos = async () => {
    setErrorMsg('');
    try {
      const files = await Promise.all(
        subject.photos.map((p, i) => dataUrlToFile(p, `mosque-${i + 1}.jpg`))
      );
      if (!navigator.canShare({ files })) {
        setErrorMsg('هاتفك لا يدعم مشاركة الصور مباشرة — أضفها من صفحة المسجد في جوجل.');
        return;
      }
      await navigator.share({ files, title: subject.officialName });
      setShared(true);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setErrorMsg('تعذّرت مشاركة الصور — أضفها من صفحة المسجد في جوجل.');
    }
  };

  const update = async (next: GoogleMapsStatus) => {
    setErrorMsg('');
    setBusy(true);
    try {
      await setGoogleMapsStatus(subject.id, next);
      setOptimistic(next);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذّر حفظ الحالة.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl bg-sand border border-line p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-white border border-line flex items-center justify-center text-[13px] font-black text-[#4285F4]">
            G
          </span>
          <h3 className="font-extrabold text-ink">النشر في خرائط جوجل</h3>
        </div>
        <GoogleStatusBadge status={status} />
      </div>

      {status !== 'not_submitted' && (by || at) && (
        <p className="text-xs text-muted tabular-nums">
          {status === 'live' ? 'أكّده' : 'أرسله'} {by || '—'}
          {at ? ` · ${formatEnglishDateTime(at)}` : ''}
        </p>
      )}

      {status === 'not_submitted' && (
        <>
          <div className="space-y-2">
            <button type="button" onClick={() => void copyName()} className="w-full flex items-center gap-3 text-right">
              <Step n={1} done={copied} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-ink">انسخ اسم المسجد</span>
                <span className="block text-xs text-muted truncate">{subject.officialName}</span>
              </span>
              <Copy className="w-4 h-4 text-muted" />
            </button>

            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                void copyName();
                setOpened(true);
                setShowHelp(true);
              }}
              className="w-full flex items-center gap-3 text-right"
            >
              <Step n={2} done={opened} />
              <span className="flex-1 text-sm font-bold text-ink">افتح المكان في خرائط جوجل وأرسله</span>
              <ExternalLink className="w-4 h-4 text-muted" />
            </a>

            {subject.photos.length > 0 && (
              <button
                type="button"
                onClick={() => void sharePhotos()}
                disabled={!canSharePhotos}
                className="w-full flex items-center gap-3 text-right disabled:opacity-60"
              >
                <Step n={3} done={shared} />
                <span className="flex-1 text-sm font-bold text-ink">
                  {canSharePhotos ? `شارك الصور (${subject.photos.length}) مع خرائط جوجل` : 'أضف الصور من صفحة المسجد في جوجل'}
                </span>
                <ImageUp className="w-4 h-4 text-muted" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            className="w-full flex items-center justify-between text-xs font-bold text-brand"
          >
            <span>كيف أرسله داخل جوجل؟</span>
            <ChevronDown className={`w-4 h-4 transition ${showHelp ? 'rotate-180' : ''}`} />
          </button>
          {showHelp && (
            <div className="text-[13px] text-ink/80 leading-relaxed space-y-1.5 bg-white rounded-xl p-3 border border-line">
              <p>
                <b>المسجد ظاهر؟</b> اضغط عليه ← «اقتراح تعديل» ← الصق الاسم أو صحّح الموقع ← «إرسال».
              </p>
              <p>
                <b>غير ظاهر؟</b> اضغط مطوّلاً على مكانه ← «إضافة مكان مفقود» ← الصق الاسم ← الفئة «مسجد» ← «إرسال».
              </p>
              <p className="text-xs text-muted">جوجل تراجع خلال أيام وترسل النتيجة لبريد حساب جوجل في الهاتف.</p>
            </div>
          )}

          <button
            type="button"
            onClick={() => void update('submitted')}
            disabled={busy}
            className={`w-full h-12 ${opened ? 'btn-gold shadow-md' : 'btn-outline'}`}
          >
            <Send className="w-4 h-4" />
            {busy ? 'جارٍ الحفظ...' : 'تم — أرسلته إلى جوجل'}
          </button>
        </>
      )}

      {status === 'submitted' && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void update('live')} disabled={busy} className="btn-primary h-11 text-sm">
            <CheckCircle2 className="w-4 h-4 text-gold" />
            ظهر في جوجل
          </button>
          <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="btn-outline h-11 text-sm">
            <ExternalLink className="w-4 h-4" />
            تحقّق
          </a>
        </div>
      )}

      {status !== 'not_submitted' && (
        <button
          type="button"
          onClick={() => void update('not_submitted')}
          disabled={busy}
          className="w-full text-xs text-muted flex items-center justify-center gap-1 hover:underline disabled:opacity-60"
        >
          <RotateCcw className="w-3 h-3" />
          إعادة الإرسال
        </button>
      )}

      {errorMsg && <p className="text-xs text-red-700">{errorMsg}</p>}
    </section>
  );
}
