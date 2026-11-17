import { CheckCircle2, ExternalLink, Info, MapPin, Tag, X } from 'lucide-react';
import { generateGoogleMapsUrl } from '../lib/utils/geo';
import type { OsmMosqueCandidate } from '../types/mosque';

interface OsmCandidateSheetProps {
  candidate: OsmMosqueCandidate | null;
  onClose: () => void;
  onVerifyAndDocument: (candidate: OsmMosqueCandidate) => void;
}

const DISPLAY_TAG_LABELS: Record<string, string> = {
  'name:ar': 'الاسم بالعربية (name:ar)',
  name: 'الاسم المنشور (name)',
  alt_name: 'اسم بديل',
  'addr:city': 'المدينة',
  'addr:suburb': 'المحلة / المنطقة',
  'addr:street': 'الشارع',
  building: 'نوع المبنى',
  denomination: 'المذهب / التصنيف',
};

export function OsmCandidateSheet({
  candidate,
  onClose,
  onVerifyAndDocument,
}: OsmCandidateSheetProps) {
  if (!candidate) return null;

  const mapsUrl = generateGoogleMapsUrl(candidate.lat, candidate.lng);
  const tagEntries = Object.entries(candidate.tags ?? {}).filter(([k, v]) =>
    Boolean(v) && (k in DISPLAY_TAG_LABELS || k === 'amenity' || k === 'religion')
  );

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/45 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-[#E5E2D9] shadow-2xl overflow-hidden max-h-[88dvh] flex flex-col pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-[#D8D4C8]" />
        </div>

        <div className="px-5 py-3.5 border-b border-[#EFECE4] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#475569]">
              مسجد موجود مسبقاً (غير موثَّق بعد)
            </p>
            <h2 className="text-lg font-bold text-[#1A2421] mt-0.5 leading-snug">
              {candidate.nameAr || candidate.nameRaw || candidate.name}
            </h2>
            {candidate.nameAr && candidate.nameRaw && candidate.nameAr !== candidate.nameRaw && (
              <p className="text-xs text-[#5A6561] mt-0.5">
                الاسم المسجل (name): {candidate.nameRaw}
              </p>
            )}
            <p className="text-xs text-[#5A6561] mt-1 flex items-center gap-1 tabular-nums">
              <MapPin className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
              <span dir="ltr">
                {candidate.lat.toFixed(6)}, {candidate.lng.toFixed(6)}
              </span>
              <span aria-hidden="true">·</span>
              <span dir="ltr">{candidate.osmType}/{candidate.osmNumericId}</span>
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

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Published OSM Data */}
          <div className="bg-[#FAF8F4] border border-[#E5E2D9] rounded-xl p-3.5 space-y-2">
            <p className="text-xs font-bold text-[#1A2421] flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-[#64748B]" />
              <span>البيانات المنشورة على OpenStreetMap</span>
            </p>
            {tagEntries.length > 0 ? (
              <div className="bg-white border border-[#EFECE4] rounded-lg divide-y divide-[#EFECE4] text-xs">
                {tagEntries.map(([k, v]) => (
                  <div key={k} className="px-3 py-1.5 flex items-center justify-between gap-2">
                    <span className="text-[#5A6561]">
                      {DISPLAY_TAG_LABELS[k] ?? k}
                    </span>
                    <span className="font-semibold text-[#1A2421]">{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#5A6561]">لا توجد تفاصيل إضافية منشورة.</p>
            )}
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => onVerifyAndDocument(candidate)}
              className="w-full h-12 rounded-xl bg-[#0F4C3A] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#0B3A2C] active:scale-[0.98] transition"
            >
              <CheckCircle2 className="w-4 h-4 text-[#C9A24B]" />
              <span>توثيق / تصحيح هذا المسجد</span>
            </button>

            <div className="space-y-1.5">
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="بعد فتح خرائط جوجل اضغط على «اقتراح تعديل» لتحديث بيانات المسجد"
                className="w-full h-12 rounded-xl bg-white border border-[#D8D4C8] text-[#1A2421] font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#FAF8F4] transition"
              >
                <ExternalLink className="w-4 h-4 text-[#0F4C3A]" />
                <span>اقتراح تعديل في خرائط جوجل</span>
              </a>
              <p className="text-[11px] text-[#5A6561] flex items-start gap-1.5 px-1 leading-relaxed">
                <Info className="w-3.5 h-3.5 text-[#C9A24B] shrink-0 mt-0.5" />
                <span>بعد فتح خرائط جوجل في التبويب الجديد، اضغط على «اقتراح تعديل» لإرسال التصحيح.</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
