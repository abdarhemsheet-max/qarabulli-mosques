import { useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  Info,
  Mail,
  MapPin,
  Move,
  Navigation,
  Pencil,
  Share2,
  X,
} from 'lucide-react';
import type { MosqueRecord, OsmSettings, UserProfile } from '../types/mosque';
import { formatEnglishDateTime, generateDirectionsUrl } from '../lib/utils/geo';
import { DEFAULT_OSM_SETTINGS } from '../lib/supabase/settings';
import { generateGooglePlaceUrl } from '../lib/maps/googleMosques';
import { GooglePlaceDetailsBlock } from './GooglePlaceDetailsBlock';
import { OsmPublishModal } from './OsmPublishModal';

interface MosqueDetailSheetProps {
  mosque: MosqueRecord | null;
  currentUser: UserProfile;
  osmSettings?: OsmSettings;
  onClose: () => void;
  onEdit: (mosque: MosqueRecord) => void;
  onMovePin?: (mosque: MosqueRecord) => void;
}

export function MosqueDetailSheet({
  mosque,
  currentUser,
  osmSettings = DEFAULT_OSM_SETTINGS,
  onClose,
  onEdit,
  onMovePin,
}: MosqueDetailSheetProps) {
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<'url' | 'share' | 'name' | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);

  if (!mosque) return null;

  const canEdit = currentUser.role === 'admin' || mosque.createdBy === currentUser.uid;
  const directionsUrl = generateDirectionsUrl(mosque.lat, mosque.lng);
  const googlePlaceTargetUrl = mosque.googlePlaceId
    ? generateGooglePlaceUrl(mosque.lat, mosque.lng, mosque.googlePlaceId)
    : mosque.mapsUrl;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(mosque.mapsUrl);
      setCopiedType('url');
      window.setTimeout(() => setCopiedType(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyNameForGoogle = async () => {
    try {
      await navigator.clipboard.writeText(mosque.officialName);
      setCopiedType('name');
      window.setTimeout(() => setCopiedType(null), 2500);
    } catch {
      // ignore
    }
  };

  const handleShare = async () => {
    const text = [
      `مسجد: ${mosque.officialName}`,
      mosque.commonName ? `الاسم المتداول: ${mosque.commonName}` : '',
      `المحلة / المنطقة: ${mosque.locality}`,
      mosque.landmark ? `علامة دالة: ${mosque.landmark}` : '',
      `الموقع على خرائط جوجل: ${mosque.mapsUrl}`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      if (navigator.share) {
        await navigator.share({
          title: mosque.officialName,
          text,
          url: mosque.mapsUrl,
        });
      } else {
        await navigator.clipboard.writeText(text);
        setCopiedType('share');
        window.setTimeout(() => setCopiedType(null), 2200);
      }
    } catch {
      // dismissed
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[1000] bg-black/45 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
        onClick={onClose}
      >
        <div
          className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-[#E5E2D9] shadow-2xl max-h-[88dvh] flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Mobile grab handle */}
          <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
            <div className="w-10 h-1 rounded-full bg-[#D8D4C8]" />
          </div>

          {/* Header */}
          <div className="px-5 py-3.5 border-b border-[#EFECE4] flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-[#0F4C3A] leading-snug">
                {mosque.officialName}
              </h2>
              {mosque.commonName && (
                <p className="text-xs text-[#5A6561] mt-0.5">
                  الاسم المتداول: {mosque.commonName}
                </p>
              )}
              <p className="text-xs text-[#5A6561] mt-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#C9A24B] shrink-0" />
                <span>{mosque.locality}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="min-h-[44px] min-w-[44px] rounded-xl text-[#5A6561] hover:bg-[#FAF8F4] flex items-center justify-center shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Full Mosque Details */}
          <div className="p-5 overflow-y-auto space-y-4">
            {/* Prominent Google Maps Link & Public Share Box */}
            <div className="p-3.5 rounded-2xl bg-[#0F4C3A]/5 border border-[#0F4C3A]/20 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#0F4C3A]">
                  رابط الموقع على خرائط جوجل (للمشاركة مع الجمهور)
                </span>
              </div>
              <a
                href={mosque.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="block text-xs font-mono text-[#0F4C3A] underline truncate bg-white px-3 py-2 rounded-xl border border-[#D8D4C8] hover:bg-[#FAF8F4]"
              >
                {mosque.mapsUrl}
              </a>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyUrl()}
                  className="min-h-[42px] px-3 rounded-xl bg-white border border-[#D8D4C8] text-xs font-bold text-[#1A2421] flex items-center justify-center gap-1.5 hover:bg-[#FAF8F4] active:scale-[0.98] transition"
                >
                  {copiedType === 'url' ? (
                    <Check className="w-4 h-4 text-[#0F4C3A]" />
                  ) : (
                    <Copy className="w-4 h-4 text-[#0F4C3A]" />
                  )}
                  <span>{copiedType === 'url' ? 'تم نسخ الرابط' : 'نسخ الرابط'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleShare()}
                  className="min-h-[42px] px-3 rounded-xl bg-[#0F4C3A] text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#0B3A2C] active:scale-[0.98] transition"
                >
                  {copiedType === 'share' ? (
                    <Check className="w-4 h-4 text-[#C9A24B]" />
                  ) : (
                    <Share2 className="w-4 h-4 text-[#C9A24B]" />
                  )}
                  <span>{copiedType === 'share' ? 'تم نسخ بيانات المشاركة' : 'مشاركة مع الجمهور'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-[#FAF8F4] border border-[#EFECE4] rounded-xl p-3 tabular-nums">
              <div>
                <span className="block text-[#5A6561]">خط العرض</span>
                <span className="font-bold text-[#1A2421]">{mosque.lat.toFixed(6)}</span>
              </div>
              <div>
                <span className="block text-[#5A6561]">خط الطول</span>
                <span className="font-bold text-[#1A2421]">{mosque.lng.toFixed(6)}</span>
              </div>
              <div>
                <span className="block text-[#5A6561]">دقة GPS</span>
                <span className="font-bold text-[#1A2421]">{mosque.accuracy} م</span>
              </div>
              <div>
                <span className="block text-[#5A6561]">عدد الصور</span>
                <span className="font-bold text-[#1A2421]">{mosque.photoCount}</span>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-[#5A6561] mb-1">العلامة الدالة</p>
              <p className="text-sm text-[#1A2421] leading-relaxed">
                {mosque.landmark || 'لا توجد علامة دالة مسجلة'}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-[#5A6561] mb-1">ملاحظات</p>
              <p className="text-sm text-[#1A2421] leading-relaxed">
                {mosque.notes || 'لا توجد ملاحظات'}
              </p>
            </div>

            {mosque.photos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#5A6561] mb-2">
                  صور العلامة الدالة ({mosque.photos.length})
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {mosque.photos.map((photo, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setZoomedPhoto(photo)}
                      className="aspect-square rounded-xl overflow-hidden border border-[#E5E2D9] bg-[#FAF8F4] hover:opacity-90 transition"
                    >
                      <img
                        src={photo}
                        alt={`صورة العلامة الدالة ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-[#EFECE4] text-xs text-[#5A6561] flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
              <span>الموثِّق: {mosque.createdByName}</span>
              <span aria-hidden="true">·</span>
              <span>التوثيق: {formatEnglishDateTime(mosque.createdAt)}</span>
              {mosque.updatedAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>آخر تحديث: {formatEnglishDateTime(mosque.updatedAt)}</span>
                </>
              )}
              {mosque.osmId && (
                <>
                  <span aria-hidden="true">·</span>
                  <span dir="ltr">OSM: {mosque.osmId.replace('_', '/')}</span>
                </>
              )}
            </div>

            {mosque.googlePlaceId && (
              <div className="pt-2 space-y-2">
                <p className="text-xs font-bold text-[#0F4C3A]">
                  البيانات والصور المنشورة لهذا المسجد في خرائط جوجل
                </p>
                <GooglePlaceDetailsBlock placeId={mosque.googlePlaceId} />
              </div>
            )}

            {/* Google Maps Edit Suggestion Hint Box */}
            <div className="p-3 rounded-xl bg-[#FAF8F4] border border-[#E5E2D9] space-y-2">
              <a
                href={googlePlaceTargetUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => void handleCopyNameForGoogle()}
                title="ينسخ اسم المسجد تلقائياً ويفتح صفحة المسجد في خرائط جوجل"
                className="w-full min-h-[44px] px-3 rounded-xl bg-white border border-[#D8D4C8] text-[#0F4C3A] text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-[#FAF8F4] transition"
              >
                <ExternalLink className="w-4 h-4 text-[#C9A24B]" />
                <span>
                  {copiedType === 'name'
                    ? 'تم نسخ الاسم وفتح خرائط جوجل'
                    : 'نسخ الاسم وفتح جوجل للتعديل طوالي'}
                </span>
              </a>
              <a
                href="https://mail.google.com/mail/u/0/#search/Google+Maps"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[38px] px-3 rounded-xl bg-white border border-[#EFECE4] text-[#4A5552] text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-[#FAF8F4] transition"
              >
                <Mail className="w-3.5 h-3.5 text-[#EA4335]" />
                <span>متابعة ردود قبول التعديلات في Gmail</span>
              </a>
              <p className="text-[11px] text-[#5A6561] flex items-start gap-1.5 leading-relaxed">
                <Info className="w-3.5 h-3.5 text-[#C9A24B] shrink-0 mt-0.5" />
                <span>
                  عند الضغط يُنسخ الاسم تلقائياً وتُفتح صفحة المسجد في جوجل؛ اضغط «اقتراح تعديل» ← «لصق» ← «إرسال» (تعديل جوجل يتم عبر الخريطة وليس عبر إرسال Gmail).
                </span>
              </p>
            </div>

            {osmSettings.osmPublishEnabled && (
              <button
                type="button"
                onClick={() => setPublishOpen(true)}
                className="w-full min-h-[46px] px-4 rounded-xl bg-[#1A2421] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#0F4C3A] transition"
              >
                <Globe className="w-4 h-4 text-[#C9A24B]" />
                <span>نشر إلى OpenStreetMap</span>
              </button>
            )}
          </div>

          {/* Bottom Actions */}
          <div className="p-4 border-t border-[#EFECE4] bg-[#FAF8F4] flex flex-wrap items-center gap-2">
            <a
              href={mosque.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-[140px] min-h-[46px] px-3 rounded-xl bg-[#0F4C3A] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-[#0B3A2C] transition"
            >
              <ExternalLink className="w-4 h-4" />
              <span>فتح في خرائط جوجل</span>
            </a>

            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-[110px] min-h-[46px] px-3 rounded-xl bg-white border border-[#D8D4C8] text-[#0F4C3A] text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-[#FAF8F4] transition"
            >
              <Navigation className="w-4 h-4 text-[#C9A24B]" />
              <span>الاتجاهات</span>
            </a>

            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(mosque)}
                  className="min-h-[46px] px-4 rounded-xl bg-[#C9A24B]/20 border border-[#C9A24B]/50 text-[#1A2421] text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-[#C9A24B]/30 transition"
                >
                  <Pencil className="w-4 h-4 text-[#0F4C3A]" />
                  <span>تعديل البيانات</span>
                </button>
                {onMovePin && (
                  <button
                    type="button"
                    onClick={() => onMovePin(mosque)}
                    title="تعديل موقع الدبوس على الخريطة"
                    className="min-h-[46px] px-3 rounded-xl bg-white border border-[#D8D4C8] text-[#1A2421] text-xs font-semibold flex items-center justify-center gap-1 hover:bg-[#FAF8F4] transition"
                  >
                    <Move className="w-4 h-4 text-[#0F4C3A]" />
                    <span className="hidden sm:inline">تحريك الموقع</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {publishOpen && (
        <OsmPublishModal
          mosque={mosque}
          osmSettings={osmSettings}
          currentUser={currentUser}
          onClose={() => setPublishOpen(false)}
        />
      )}

      {zoomedPhoto && (
        <div
          className="fixed inset-0 z-[1100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomedPhoto(null)}
        >
          <button
            type="button"
            onClick={() => setZoomedPhoto(null)}
            aria-label="إغلاق الصورة"
            className="absolute top-4 left-4 min-h-[44px] min-w-[44px] rounded-full bg-white/15 text-white flex items-center justify-center"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={zoomedPhoto}
            alt="تكبير صورة العلامة الدالة"
            className="max-w-full max-h-[88vh] rounded-xl object-contain"
          />
        </div>
      )}
    </>
  );
}
