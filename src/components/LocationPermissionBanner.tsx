import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, X } from 'lucide-react';

type GeoStatus = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

/**
 * Asks for the device location as soon as the site opens, and keeps a small
 * banner on screen until permission is granted.
 */
export function LocationPermissionBanner() {
  const [status, setStatus] = useState<GeoStatus>('unknown');
  const [requesting, setRequesting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const askedOnLoadRef = useRef(false);

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      return;
    }
    setRequesting(true);
    navigator.geolocation.getCurrentPosition(
      () => {
        setRequesting(false);
        setStatus('granted');
      },
      (err) => {
        setRequesting(false);
        // Timeout / unavailable still means the permission itself was granted.
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'granted');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }, []);

  useEffect(() => {
    if (askedOnLoadRef.current) return;
    askedOnLoadRef.current = true;

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      return;
    }

    let permStatus: PermissionStatus | null = null;
    const onChange = () => {
      if (permStatus) setStatus(permStatus.state as GeoStatus);
    };

    const permissions = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (permissions?.query) {
      permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((res) => {
          permStatus = res;
          setStatus(res.state as GeoStatus);
          res.addEventListener('change', onChange);
          if (res.state !== 'granted') requestLocation();
        })
        .catch(() => requestLocation());
    } else {
      requestLocation();
    }

    return () => {
      permStatus?.removeEventListener('change', onChange);
    };
  }, [requestLocation]);

  if (dismissed || status === 'granted' || status === 'unknown') return null;

  const isDenied = status === 'denied';
  const isUnsupported = status === 'unsupported';

  return (
    <div
      className="sticky top-0 z-[60] bg-[#0F4C3A] text-white px-3 py-2.5 shadow-md"
      role="status"
    >
      <div className="max-w-3xl mx-auto flex items-start gap-2.5">
        <MapPin className="w-5 h-5 shrink-0 mt-0.5 text-[#C9A24B]" />
        <div className="flex-1 text-xs sm:text-sm leading-relaxed">
          {isUnsupported ? (
            <p>هذا المتصفح لا يدعم تحديد الموقع. استخدم متصفح الهاتف (Chrome أو Safari).</p>
          ) : isDenied ? (
            <p>
              إذن الموقع مرفوض. فعّله من إعدادات المتصفح: اضغط على رمز القفل 🔒 بجانب
              عنوان الموقع ← الأذونات ← الموقع ← سماح، ثم أعد تحميل الصفحة.
            </p>
          ) : (
            <p>يحتاج التطبيق إلى معرفة موقعك الحالي لتوثيق المساجد بدقة. يرجى السماح بالوصول للموقع.</p>
          )}
        </div>
        {!isUnsupported && (
          <button
            type="button"
            onClick={isDenied ? () => window.location.reload() : requestLocation}
            disabled={requesting}
            className="shrink-0 min-h-[36px] px-3 rounded-lg bg-[#C9A24B] text-[#0F2A22] font-bold text-xs hover:bg-[#d6b15c] disabled:opacity-60"
          >
            {requesting ? 'جاري الطلب...' : isDenied ? 'إعادة التحميل' : 'السماح بالموقع'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="إغلاق"
          className="shrink-0 p-1 rounded hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
