import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Globe,
  Send,
  X,
} from 'lucide-react';
import { linkMosqueOsmId } from '../lib/supabase/mosques';
import {
  getRequiredMosqueOsmTags,
  publishMosqueToOsm,
  type OsmPublishResult,
} from '../lib/osm/osmPublish';
import type { MosqueRecord, OsmSettings, UserProfile } from '../types/mosque';

interface OsmPublishModalProps {
  mosque: MosqueRecord | null;
  osmSettings: OsmSettings;
  currentUser: UserProfile;
  onClose: () => void;
}

export function OsmPublishModal({
  mosque,
  osmSettings,
  currentUser,
  onClose,
}: OsmPublishModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<OsmPublishResult | null>(null);

  if (!mosque) return null;

  const tags = getRequiredMosqueOsmTags(mosque);
  const isLinked = Boolean(mosque.osmId && /^(node|way)_(\d+)$/.test(mosque.osmId));

  const handleConfirmPublish = async () => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await publishMosqueToOsm(mosque, osmSettings.osmUseProduction);
      const canEditRecord =
        currentUser.role === 'admin' || mosque.createdBy === currentUser.uid;
      if (res.newOsmId && !mosque.osmId && canEditRecord) {
        await linkMosqueOsmId(mosque.id, res.newOsmId, currentUser).catch(() => undefined);
      }
      setResult(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذّر النشر إلى OpenStreetMap.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1250] bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-[#E5E2D9] shadow-2xl overflow-hidden pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-[#EFECE4] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#0F4C3A]" />
            <h2 className="text-base font-bold text-[#0F4C3A]">نشر إلى OpenStreetMap</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="min-h-[44px] min-w-[44px] rounded-xl text-[#5A6561] hover:bg-[#FAF8F4] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[82dvh] overflow-y-auto">
          {result ? (
            <div className="space-y-4 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1A2421]">
                  {result.action === 'updated'
                    ? 'تم تحديث بيانات المسجد في OpenStreetMap'
                    : 'تم نشر المسجد في OpenStreetMap'}
                </h3>
                <p className="text-xs text-[#5A6561] mt-1">
                  الخادم: {result.serverLabel} · حزمة التعديل #{result.changesetId}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <a
                  href={result.elementUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-11 px-4 rounded-xl bg-[#0F4C3A] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#0B3A2C]"
                >
                  <ExternalLink className="w-4 h-4 text-[#C9A24B]" />
                  <span>عرض العنصر على الخريطة</span>
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-11 px-4 rounded-xl border border-[#D8D4C8] text-[#1A2421] font-semibold text-sm hover:bg-[#FAF8F4]"
                >
                  إغلاق
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Target Server Notice */}
              <div
                className={`p-3 rounded-xl border text-xs leading-relaxed ${
                  osmSettings.osmUseProduction
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-[#FAF8F4] border-[#D8D4C8] text-[#1A2421]'
                }`}
              >
                <p className="font-bold flex items-center gap-1.5">
                  {osmSettings.osmUseProduction && (
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  )}
                  <span>
                    {osmSettings.osmUseProduction
                      ? 'وضع النشر: الخادم الحقيقي (www.openstreetmap.org)'
                      : 'وضع النشر: الخادم التجريبي (master.apis.dev.openstreetmap.org)'}
                  </span>
                </p>
                <p className="mt-1 text-[#4A5552]">
                  {isLinked
                    ? `سيتم تحديث العنصر المرتبط (${mosque.osmId}) بعد تسجيل دخولك بحسابك الشخصي في OSM.`
                    : 'سيتم إنشاء نقطة مسجد جديدة بعد تسجيل دخولك بحسابك الشخصي في OSM عبر OAuth 2.0.'}
                </p>
              </div>

              {/* Review Summary */}
              <div className="bg-[#FAF8F4] border border-[#E5E2D9] rounded-xl p-3.5 space-y-2">
                <p className="text-xs font-bold text-[#0F4C3A]">ملخص التعديل المطلوب اعتماده:</p>
                <div className="text-xs text-[#4A5552] tabular-nums">
                  الإحداثيات: <span dir="ltr">{mosque.lat.toFixed(6)}, {mosque.lng.toFixed(6)}</span>
                </div>
                <div className="bg-white border border-[#EFECE4] rounded-lg divide-y divide-[#EFECE4] text-xs" dir="ltr">
                  {Object.entries(tags).map(([k, v]) => (
                    <div key={k} className="px-3 py-1.5 flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-[#0F4C3A]">{k}</span>
                      <span className="font-mono text-[#1A2421] truncate">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs leading-relaxed">
                  {errorMsg}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleConfirmPublish()}
                  className="flex-1 h-12 px-4 rounded-xl bg-[#0F4C3A] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#0B3A2C] disabled:opacity-60 transition"
                >
                  <Send className="w-4 h-4 text-[#C9A24B]" />
                  <span>
                    {submitting ? 'جاري النشر...' : 'موافقة ونشر بحساب OSM'}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={onClose}
                  className="h-12 px-4 rounded-xl border border-[#D8D4C8] text-[#1A2421] font-semibold text-sm hover:bg-[#FAF8F4] transition"
                >
                  إلغاء
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
