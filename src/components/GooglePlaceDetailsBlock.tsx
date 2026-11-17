import { useEffect, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import {
  Camera,
  Clock,
  ExternalLink,
  Globe,
  Info,
  MapPin,
  MessageSquare,
  Phone,
  Star,
  Tag,
  X,
} from 'lucide-react';
import { fetchGooglePlaceRichDetails } from '../lib/maps/googleMosques';
import type {
  GoogleMosqueCandidate,
  GooglePlacePhotoItem,
  GooglePlaceRichDetails,
} from '../types/mosque';

interface GooglePlaceDetailsBlockProps {
  placeId: string;
  fallbackCandidate?: Pick<
    GoogleMosqueCandidate,
    'displayName' | 'formattedAddress' | 'businessStatus' | 'googleMapsUri' | 'lat' | 'lng'
  >;
  onLoadedRichDetails?: (details: GooglePlaceRichDetails) => void;
}

function formatBusinessStatusLabel(status: string): string {
  switch (status) {
    case 'OPERATIONAL':
      return 'مفتوح ونشط على خرائط جوجل';
    case 'CLOSED_TEMPORARILY':
      return 'مغلق مؤقتاً في خرائط جوجل';
    case 'CLOSED_PERMANENTLY':
      return 'معلَّم كمغلق نهائياً في خرائط جوجل';
    default:
      return 'مسجل على خرائط جوجل';
  }
}

export function GooglePlaceDetailsBlock({
  placeId,
  fallbackCandidate,
  onLoadedRichDetails,
}: GooglePlaceDetailsBlockProps) {
  const placesLib = useMapsLibrary('places');
  const [rich, setRich] = useState<GooglePlaceRichDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [activePhoto, setActivePhoto] = useState<GooglePlacePhotoItem | null>(null);
  const [showAllHours, setShowAllHours] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!placesLib || !placeId) {
      setRich(null);
      return;
    }

    setLoading(true);
    void fetchGooglePlaceRichDetails(placesLib, placeId)
      .then((res) => {
        if (cancelled) return;
        setRich(res);
        if (res) {
          onLoadedRichDetails?.(res);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [placesLib, placeId]);

  const displayName = rich?.displayName || fallbackCandidate?.displayName || 'غير متوفر';
  const formattedAddress =
    rich?.formattedAddress || fallbackCandidate?.formattedAddress || 'غير متوفر';
  const businessStatus =
    rich?.businessStatus || fallbackCandidate?.businessStatus || '';
  const lat = rich?.lat ?? fallbackCandidate?.lat;
  const lng = rich?.lng ?? fallbackCandidate?.lng;

  return (
    <div className="space-y-3.5">
      {/* Google Maps Photos Gallery */}
      <div className="bg-[#FAF8F4] border border-[#E5E2D9] rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-[#1A2421] flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-[#EA4335]" />
            <span>صور المسجد في خرائط جوجل</span>
          </p>
          {rich && (
            <span className="text-[11px] font-semibold text-[#5A6561] tabular-nums">
              ({rich.photos.length})
            </span>
          )}
        </div>

        {loading && !rich ? (
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                className="aspect-square rounded-xl bg-[#EFECE4] animate-pulse"
              />
            ))}
          </div>
        ) : rich && rich.photos.length > 0 ? (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {rich.photos.map((photo, idx) => (
                <button
                  key={`${placeId}_photo_${idx}`}
                  type="button"
                  onClick={() => setActivePhoto(photo)}
                  className="relative w-28 h-24 shrink-0 rounded-xl overflow-hidden border border-[#D8D4C8] bg-white hover:opacity-95 transition"
                >
                  <img
                    src={photo.thumbUrl}
                    alt={`${displayName} - صورة ${idx + 1}`}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[#5A6561]">
              اضغط على أي صورة للتكبير وعرض بيانات المصوّر من خرائط جوجل.
            </p>
          </>
        ) : (
          <p className="text-xs text-[#5A6561]">
            {placesLib
              ? 'لا توجد صور منشورة لهذا المسجد في خرائط جوجل حالياً.'
              : 'مكتبة صور جوجل غير متوفرة حالياً.'}
          </p>
        )}
      </div>

      {/* Rating & Summary */}
      {rich && (rich.rating !== null || rich.editorialSummary) && (
        <div className="bg-[#FAF8F4] border border-[#E5E2D9] rounded-xl p-3.5 space-y-2 text-xs">
          {rich.rating !== null && (
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-[#1A2421] flex items-center gap-1.5">
                <Star className="w-4 h-4 text-[#C9A24B] fill-[#C9A24B]" />
                <span>تقييم خرائط جوجل</span>
              </span>
              <span className="font-bold text-[#0F4C3A] tabular-nums">
                {rich.rating.toFixed(1)} / 5 ({rich.userRatingCount} تقييم)
              </span>
            </div>
          )}
          {rich.editorialSummary && (
            <p className="text-[#4A5552] leading-relaxed">{rich.editorialSummary}</p>
          )}
        </div>
      )}

      {/* Full Details Table */}
      <div className="bg-[#FAF8F4] border border-[#E5E2D9] rounded-xl p-3.5 space-y-2 text-xs">
        <p className="font-bold text-[#1A2421] flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-[#0F4C3A]" />
          <span>التفاصيل المسجلة في خرائط جوجل</span>
        </p>

        <div className="bg-white border border-[#EFECE4] rounded-lg divide-y divide-[#EFECE4]">
          <div className="px-3 py-2 flex items-start justify-between gap-2">
            <span className="text-[#5A6561] shrink-0">اسم المكان</span>
            <span className="font-bold text-[#1A2421] text-left">{displayName}</span>
          </div>

          <div className="px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-[#5A6561] shrink-0 flex items-center gap-1">
              <Tag className="w-3 h-3" />
              <span>الفئة</span>
            </span>
            <span className="font-semibold text-[#0F4C3A]">
              {rich?.categoryLabel || 'مسجد'}
            </span>
          </div>

          <div className="px-3 py-2 flex items-start justify-between gap-2">
            <span className="text-[#5A6561] shrink-0">العنوان المسجل</span>
            <span className="font-medium text-[#1A2421] text-left">
              {formattedAddress}
            </span>
          </div>

          {rich?.plusCode && (
            <div className="px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[#5A6561] shrink-0 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                <span>رمز الموقع (Plus Code)</span>
              </span>
              <span dir="ltr" className="font-mono text-[#1A2421]">
                {rich.plusCode}
              </span>
            </div>
          )}

          {typeof lat === 'number' && typeof lng === 'number' && (
            <div className="px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[#5A6561] shrink-0">الإحداثيات</span>
              <span dir="ltr" className="font-mono text-[#1A2421] tabular-nums">
                {lat.toFixed(6)}, {lng.toFixed(6)}
              </span>
            </div>
          )}

          <div className="px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-[#5A6561] shrink-0">الحالة</span>
            <span className="font-semibold text-[#0F4C3A]">
              {formatBusinessStatusLabel(businessStatus)}
            </span>
          </div>

          {rich?.phoneNumber && (
            <div className="px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[#5A6561] shrink-0 flex items-center gap-1">
                <Phone className="w-3 h-3" />
                <span>رقم الهاتف</span>
              </span>
              <a
                href={`tel:${rich.phoneNumber}`}
                dir="ltr"
                className="font-semibold text-[#0F4C3A] underline"
              >
                {rich.phoneNumber}
              </a>
            </div>
          )}

          {rich?.websiteUri && (
            <div className="px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[#5A6561] shrink-0 flex items-center gap-1">
                <Globe className="w-3 h-3" />
                <span>الموقع الإلكتروني</span>
              </span>
              <a
                href={rich.websiteUri}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="font-medium text-[#0F4C3A] underline truncate max-w-[180px] flex items-center gap-1"
              >
                <span>{rich.websiteUri.replace(/^https?:\/\//, '')}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
          )}

          <div className="px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-[#5A6561] shrink-0">معرّف جوجل</span>
            <span
              dir="ltr"
              className="font-mono text-[11px] text-[#4A5552] truncate max-w-[180px]"
            >
              {placeId}
            </span>
          </div>
        </div>

        {/* Opening Hours */}
        {rich && rich.weekdayDescriptions.length > 0 && (
          <div className="bg-white border border-[#EFECE4] rounded-lg p-3 space-y-1.5">
            <button
              type="button"
              onClick={() => setShowAllHours((prev) => !prev)}
              className="w-full flex items-center justify-between gap-2 text-xs font-bold text-[#1A2421]"
            >
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#C9A24B]" />
                <span>ساعات العمل على خرائط جوجل</span>
              </span>
              <span className="text-[#0F4C3A] font-semibold">
                {showAllHours ? 'إخفاء' : 'عرض الجدول'}
              </span>
            </button>
            {showAllHours && (
              <ul className="pt-1.5 border-t border-[#EFECE4] space-y-1 text-[11px] text-[#4A5552]">
                {rich.weekdayDescriptions.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Latest Reviews from Google Maps */}
      {rich && rich.reviews.length > 0 && (
        <div className="bg-[#FAF8F4] border border-[#E5E2D9] rounded-xl p-3.5 space-y-2.5 text-xs">
          <p className="font-bold text-[#1A2421] flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-[#0F4C3A]" />
            <span>أحدث التعليقات في خرائط جوجل ({rich.reviews.length})</span>
          </p>
          <div className="space-y-2">
            {rich.reviews.map((rev, i) => (
              <div
                key={i}
                className="bg-white border border-[#EFECE4] rounded-lg p-2.5 space-y-1"
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-bold text-[#1A2421]">
                    {rev.authorName || 'مستخدم خرائط جوجل'}
                  </span>
                  <span className="text-[#5A6561] tabular-nums">
                    {rev.rating !== null ? `★ ${rev.rating}` : ''}{' '}
                    {rev.relativeTime ? `· ${rev.relativeTime}` : ''}
                  </span>
                </div>
                {rev.text && (
                  <p className="text-xs text-[#4A5552] leading-relaxed">{rev.text}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Photo Lightbox with mandatory Google Author Attributions */}
      {activePhoto && (
        <div
          className="fixed inset-0 z-[1100] bg-black/90 flex flex-col items-center justify-center p-4 gap-3"
          onClick={() => setActivePhoto(null)}
        >
          <button
            type="button"
            onClick={() => setActivePhoto(null)}
            aria-label="إغلاق الصورة"
            className="absolute top-4 left-4 min-h-[44px] min-w-[44px] rounded-full bg-white/15 text-white flex items-center justify-center"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={activePhoto.fullUrl}
            alt={displayName}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[80vh] rounded-xl object-contain"
          />
          {activePhoto.attributions.length > 0 && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-white/90 bg-black/60 px-3 py-1.5 rounded-lg flex flex-wrap items-center gap-2"
            >
              <span>المصوّر على خرائط جوجل:</span>
              {activePhoto.attributions.map((attr, idx) =>
                attr.uri ? (
                  <a
                    key={idx}
                    href={attr.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-[#C9A24B] font-semibold"
                  >
                    {attr.displayName}
                  </a>
                ) : (
                  <span key={idx}>{attr.displayName}</span>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
