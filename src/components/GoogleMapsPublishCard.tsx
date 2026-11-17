import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  ImageUp,
  RotateCcw,
  Send,
} from 'lucide-react';
import type { GoogleMapsStatus, MosqueRecord } from '../types/mosque';
import { setGoogleMapsStatus } from '../lib/supabase/mosques';
import { formatEnglishDateTime } from '../lib/utils/geo';
import { generateGooglePlaceUrl } from '../lib/maps/googleMosques';

export interface GoogleMapsPublishSubject {
  id: string;
  officialName: string;
  locality: string;
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

const STATUS_LABEL: Record<GoogleMapsStatus, string> = {
  not_submitted: 'لم يُرسل لجوجل بعد',
  submitted: 'أُرسل لجوجل — بانتظار المراجعة',
  live: 'ظاهر في خرائط جوجل',
};

const STATUS_STYLE: Record<GoogleMapsStatus, string> = {
  not_submitted: 'bg-[#EFECE4] text-[#4A5552]',
  submitted: 'bg-amber-100 text-amber-900',
  live: 'bg-[#0F4C3A] text-white',
};

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}

export function GoogleMapsPublishCard({ subject, liveRecord }: GoogleMapsPublishCardProps) {
  const [copied, setCopied] = useState(false);
  const [opened, setOpened] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [photoMsg, setPhotoMsg] = useState('');
  const [optimisticStatus, setOptimisticStatus] = useState<GoogleMapsStatus | null>(null);

  const status: GoogleMapsStatus = optimisticStatus ?? liveRecord?.googleMapsStatus ?? 'not_submitted';
  const submittedBy = liveRecord?.googleMapsSubmittedByName ?? '';
  const submittedAt = liveRecord?.googleMapsSubmittedAt ?? null;

  const googleUrl = subject.googlePlaceId
    ? generateGooglePlaceUrl(subject.lat, subject.lng, subject.googlePlaceId)
    : `https://www.google.com/maps/search/?api=1&query=${subject.lat.toFixed(6)},${subject.lng.toFixed(6)}`;

  const canSharePhotos =
    subject.photos.length > 0 &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(subject.officialName);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const handleOpen = () => {
    void handleCopy();
    setOpened(true);
    setShowHelp(true);
  };

  const handleSharePhotos = async () => {
    setPhotoMsg('');
    try {
      const files = await Promise.all(
        subject.photos.map((p, i) => dataUrlToFile(p, `mosque-${subject.id}-${i + 1}.jpg`))
      );
      if (!navigator.canShare({ files })) {
        setPhotoMsg('هاتفك لا يدعم مشاركة الصور مباشرة. افتح المسجد في جوجل واضغط «إضافة صور».');
        return;
      }
      await navigator.share({ files, title: subject.officialName });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setPhotoMsg('تعذّرت مشاركة الصور. افتح المسجد في جوجل واضغط «إضافة صور».');
    }
  };

  const updateStatus = async (next: GoogleMapsStatus) => {
    setErrorMsg('');
    setBusy(true);
    try {
      await setGoogleMapsStatus(subject.id, next);
      setOptimisticStatus(next);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذّر حفظ الحالة.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3.5 rounded-2xl bg-white border-2 border-[#0F4C3A]/15 space-y-3 text-right">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-bold text-[#0F4C3A]">التوثيق في خرائط جوجل</p>
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${STATUS_STYLE[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      {status !== 'not_submitted' && (submittedBy || submittedAt) && (
        <p className="text-[11px] text-[#5A6561] tabular-nums">
          {status === 'live' ? 'أكّده' : 'أرسله'}: {submittedBy || '—'}
          {submittedAt ? ` · ${formatEnglishDateTime(submittedAt)}` : ''}
        </p>
      )}

      {status === 'not_submitted' && (
        <>
          <ol className="space-y-2">
            <li>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#FAF8F4] border border-[#D8D4C8] text-[#1A2421] text-sm font-bold flex items-center gap-2 active:scale-[0.99] transition"
              >
                <span className="w-6 h-6 rounded-full bg-[#0F4C3A] text-white text-xs flex items-center justify-center shrink-0">1</span>
                {copied ? <Check className="w-4 h-4 text-[#0F4C3A]" /> : <Copy className="w-4 h-4 text-[#C9A24B]" />}
                <span className="truncate">{copied ? 'تم نسخ الاسم' : `نسخ الاسم: ${subject.officialName}`}</span>
              </button>
            </li>
            <li>
              <a
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleOpen}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#0F4C3A] text-white text-sm font-bold flex items-center gap-2 active:scale-[0.99] transition"
              >
                <span className="w-6 h-6 rounded-full bg-white text-[#0F4C3A] text-xs flex items-center justify-center shrink-0">2</span>
                <ExternalLink className="w-4 h-4 text-[#C9A24B]" />
                <span>فتح موقع المسجد في خرائط جوجل</span>
              </a>
            </li>
            {subject.photos.length > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => void handleSharePhotos()}
                  disabled={!canSharePhotos}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#FAF8F4] border border-[#D8D4C8] text-[#1A2421] text-sm font-bold flex items-center gap-2 disabled:opacity-60 active:scale-[0.99] transition"
                >
                  <span className="w-6 h-6 rounded-full bg-[#0F4C3A] text-white text-xs flex items-center justify-center shrink-0">3</span>
                  <ImageUp className="w-4 h-4 text-[#C9A24B]" />
                  <span>
                    {canSharePhotos
                      ? `مشاركة الصور (${subject.photos.length}) إلى خرائط جوجل`
                      : 'أضف الصور من صفحة المسجد في جوجل'}
                  </span>
                </button>
                {photoMsg && <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">{photoMsg}</p>}
              </li>
            )}
          </ol>

          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            className="w-full flex items-center justify-between text-xs font-bold text-[#0F4C3A] py-1"
          >
            <span>ماذا أفعل داخل خرائط جوجل؟</span>
            <ChevronDown className={`w-4 h-4 transition ${showHelp ? 'rotate-180' : ''}`} />
          </button>
          {showHelp && (
            <div className="text-xs text-[#4A5552] leading-relaxed space-y-2 bg-[#FAF8F4] rounded-xl p-3 border border-[#EFECE4]">
              <p>
                <b className="text-[#1A2421]">إذا ظهر المسجد في جوجل:</b> اضغط عليه ← «اقتراح تعديل» ← صحّح
                الاسم أو الموقع (الصق الاسم) ← «إرسال». ولإضافة صورة: «الصور» ← «إضافة صور».
              </p>
              <p>
                <b className="text-[#1A2421]">إذا لم يظهر:</b> اضغط مطوّلاً على مكان المسجد في الخريطة ←
                «إضافة مكان مفقود» ← الصق الاسم ← الفئة «مسجد» ← «إرسال».
              </p>
              <p className="text-[11px] text-[#5A6561]">
                جوجل تراجع الإضافات خلال أيام وترسل النتيجة إلى بريد حساب جوجل المستخدم.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => void updateStatus('submitted')}
            disabled={busy}
            className={`w-full min-h-[46px] rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition disabled:opacity-60 ${
              opened
                ? 'bg-[#C9A24B] text-[#0F2A22] shadow-md'
                : 'bg-white border border-[#C9A24B] text-[#1A2421]'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>{busy ? 'جاري الحفظ...' : 'أرسلته إلى جوجل ✓'}</span>
          </button>
        </>
      )}

      {status === 'submitted' && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void updateStatus('live')}
            disabled={busy}
            className="min-h-[44px] rounded-xl bg-[#0F4C3A] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <CheckCircle2 className="w-4 h-4 text-[#C9A24B]" />
            <span>ظهر في جوجل</span>
          </button>
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] rounded-xl bg-white border border-[#D8D4C8] text-[#0F4C3A] text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="w-4 h-4" />
            <span>تحقّق في جوجل</span>
          </a>
        </div>
      )}

      {status !== 'not_submitted' && (
        <button
          type="button"
          onClick={() => void updateStatus('not_submitted')}
          disabled={busy}
          className="w-full text-[11px] text-[#5A6561] flex items-center justify-center gap-1 py-1 hover:underline disabled:opacity-60"
        >
          <RotateCcw className="w-3 h-3" />
          <span>إعادة إرسال / تراجع</span>
        </button>
      )}

      {errorMsg && <p className="text-xs text-red-700">{errorMsg}</p>}
    </div>
  );
}
