import { useMemo, useState } from 'react';
import { Check, Copy, LocateFixed, MapPinOff, X } from 'lucide-react';
import { detectBrowserEnv, type GeoPermission } from '../../lib/location/geoPermission';

interface LocationCardProps {
  permission: GeoPermission;
  locating: boolean;
  onRequest: () => void;
  onDismiss: () => void;
}

/**
 * Compact card above the map's main button. Never blocks the map.
 */
export function LocationCard({ permission, locating, onRequest, onDismiss }: LocationCardProps) {
  const env = useMemo(() => detectBrowserEnv(), []);
  const [copied, setCopied] = useState(false);
  const denied = permission === 'denied';
  const unsupported = permission === 'unsupported';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + window.location.pathname);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="awqaf-sheet card shadow-xl p-3.5 space-y-3">
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            denied || unsupported ? 'bg-red-50 text-red-700' : 'bg-brand-soft text-brand'
          }`}
        >
          {denied || unsupported ? <MapPinOff className="w-5 h-5" /> : <LocateFixed className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-ink leading-snug">
            {denied ? 'الموقع مقفول في المتصفح' : unsupported ? 'المتصفح لا يدعم الموقع' : 'فعّل موقعك'}
          </p>
          <p className="text-sm text-muted leading-relaxed">
            {denied
              ? env.isIOS
                ? 'اضغط «ᴀA» في شريط العنوان ← إعدادات موقع الويب ← الموقع ← سماح.'
                : 'اضغط 🔒 بجانب الرابط ← الأذونات ← الموقع ← سماح.'
              : unsupported
                ? 'افتح الرابط في Chrome أو Safari.'
                : 'حتى نعرف أين أنت ونضع المسجد في مكانه بدقة.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="إخفاء"
          className="w-8 h-8 -mt-1 -me-1 rounded-full text-muted flex items-center justify-center hover:bg-sand"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {env.isInAppBrowser && (
        <button type="button" onClick={() => void copyLink()} className="btn-outline w-full h-11 text-sm">
          {copied ? <Check className="w-4 h-4 text-brand" /> : <Copy className="w-4 h-4" />}
          {copied ? 'تم النسخ — افتحه في المتصفح' : 'أنت داخل تطبيق: انسخ الرابط وافتحه في المتصفح'}
        </button>
      )}

      {!unsupported && (
        <button
          type="button"
          onClick={denied ? () => window.location.reload() : onRequest}
          disabled={locating}
          className="btn-primary w-full h-12"
        >
          <LocateFixed className={`w-5 h-5 text-gold ${locating ? 'animate-spin' : ''}`} />
          {denied ? 'سمحت؟ أعد التحميل' : locating ? 'جارٍ تحديد موقعك...' : 'السماح بالموقع'}
        </button>
      )}
    </div>
  );
}
