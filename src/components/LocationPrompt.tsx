import { useMemo, useState } from 'react';
import { Check, Copy, LocateFixed, MapPin, MousePointerClick, RotateCw } from 'lucide-react';
import { detectBrowserEnv, type GeoPermission } from '../lib/location/geoPermission';

interface LocationPromptProps {
  permission: GeoPermission;
  locating: boolean;
  /** Must be called from the tap itself so the browser shows its prompt. */
  onRequest: () => void;
  /** Continue without GPS and place the pin by hand. */
  onManual: () => void;
}

/**
 * One calm card over the map that asks for location with a single tap, and
 * explains exactly how to unblock it on this phone if it was refused.
 */
export function LocationPrompt({ permission, locating, onRequest, onManual }: LocationPromptProps) {
  const env = useMemo(() => detectBrowserEnv(), []);
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split('?')[0]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  const isDenied = permission === 'denied';
  const isUnsupported = permission === 'unsupported';
  const showInAppHint = env.isInAppBrowser && !isUnsupported;

  return (
    <div className="absolute inset-0 z-30 flex items-end sm:items-center justify-center bg-black/25 p-3 pb-[5.25rem] sm:pb-3">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-[#E5E2D9] p-4 space-y-3 text-right">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#0F4C3A] text-[#C9A24B] flex items-center justify-center shrink-0">
            <MapPin className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold text-[#0F4C3A] leading-snug">
              {isDenied ? 'الموقع مقفول لهذا الموقع' : isUnsupported ? 'تحديد الموقع غير متاح' : 'فعّل موقعك لتوثيق المساجد'}
            </p>
            <p className="text-xs text-[#5A6561] leading-relaxed">
              {isDenied
                ? 'لازم تسمح بالموقع من إعدادات المتصفح مرة واحدة فقط.'
                : isUnsupported
                  ? 'هذا المتصفح لا يدعم GPS. افتح الرابط في Chrome أو Safari.'
                  : 'نستخدم موقعك فقط لوضع الدبوس على مكان المسجد بدقة.'}
            </p>
          </div>
        </div>

        {showInAppHint && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2">
            <p className="text-xs text-amber-900 leading-relaxed">
              أنت تفتح الرابط من داخل تطبيق (فيسبوك/ماسنجر/إنستغرام…). الموقع غالباً لا يعمل هنا.
              انسخ الرابط وافتحه في {env.isIOS ? 'Safari' : 'Chrome'}.
            </p>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="w-full min-h-[40px] rounded-lg bg-white border border-amber-300 text-amber-900 text-xs font-bold flex items-center justify-center gap-1.5"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'تم نسخ الرابط' : 'نسخ رابط الموقع'}</span>
            </button>
          </div>
        )}

        {isDenied && (
          <ol className="text-xs text-[#1A2421] leading-relaxed space-y-1.5 bg-[#FAF8F4] rounded-xl p-3 border border-[#EFECE4] list-decimal pr-4">
            {env.isIOS ? (
              <>
                <li>اضغط «ᴀA» يمين شريط العنوان في Safari.</li>
                <li>اختر «إعدادات موقع الويب» ← «الموقع» ← «سماح».</li>
                <li>
                  إذا لم ينفع: الإعدادات ← الخصوصية والأمان ← خدمات الموقع ← تأكد أنها مفعّلة، وSafari على «أثناء الاستخدام».
                </li>
              </>
            ) : (
              <>
                <li>اضغط رمز الإعدادات/القفل 🔒 يسار شريط العنوان.</li>
                <li>اختر «الأذونات» ← «الموقع» ← «سماح».</li>
                <li>تأكد أن «الموقع/GPS» مفعّل من شريط إشعارات الهاتف.</li>
              </>
            )}
          </ol>
        )}

        {!isUnsupported && (
          <button
            type="button"
            onClick={isDenied ? () => window.location.reload() : onRequest}
            disabled={locating}
            className="w-full h-12 rounded-xl bg-[#0F4C3A] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-70"
          >
            {isDenied ? (
              <RotateCw className="w-5 h-5 text-[#C9A24B]" />
            ) : (
              <LocateFixed className={`w-5 h-5 text-[#C9A24B] ${locating ? 'animate-spin' : ''}`} />
            )}
            <span>
              {isDenied ? 'سمحت، أعد المحاولة' : locating ? 'جاري تحديد موقعك...' : 'السماح بالموقع وتحديد مكاني'}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={onManual}
          className="w-full min-h-[42px] rounded-xl bg-white border border-[#D8D4C8] text-[#1A2421] text-xs font-bold flex items-center justify-center gap-1.5"
        >
          <MousePointerClick className="w-4 h-4 text-[#0F4C3A]" />
          <span>متابعة بدون GPS (أحدد المسجد على الخريطة)</span>
        </button>
      </div>
    </div>
  );
}
