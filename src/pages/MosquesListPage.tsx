import { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Globe,
  Info,
  MapPin,
  Pencil,
  Search,
  Share2,
  Sheet,
  Trash2,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { GoogleSheetsModal } from '../components/GoogleSheetsModal';
import { OsmPublishModal } from '../components/OsmPublishModal';
import { exportMosquesToExcel } from '../lib/export/excelExport';
import { exportMosquesToCsv, exportMosquesToKml } from '../lib/export/geoExport';
import { GOOGLE_SHEETS_AVAILABLE } from '../lib/supabase/auth';
import { deleteMosque } from '../lib/supabase/mosques';
import { DEFAULT_OSM_SETTINGS } from '../lib/supabase/settings';
import { generateGooglePlaceUrl } from '../lib/maps/googleMosques';
import { formatEnglishDate, normalizeArabicName } from '../lib/utils/geo';
import type {
  GoogleSheetsConfig,
  MosqueRecord,
  OsmSettings,
  UserProfile,
} from '../types/mosque';

interface MosquesListPageProps {
  mosques: MosqueRecord[];
  currentUser: UserProfile;
  osmSettings?: OsmSettings;
  sheetConfig?: GoogleSheetsConfig | null;
  loading: boolean;
  onEditMosque: (mosque: MosqueRecord) => void;
}

export function MosquesListPage({
  mosques,
  currentUser,
  osmSettings = DEFAULT_OSM_SETTINGS,
  sheetConfig = null,
  loading,
  onEditMosque,
}: MosquesListPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [localityFilter, setLocalityFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<MosqueRecord | null>(null);
  const [publishTarget, setPublishTarget] = useState<MosqueRecord | null>(null);
  const [sheetsModalOpen, setSheetsModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const localities = useMemo(() => {
    const set = new Set<string>();
    mosques.forEach((m) => {
      if (m.locality.trim()) set.add(m.locality.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [mosques]);

  const filteredMosques = useMemo(() => {
    const q = normalizeArabicName(searchTerm);
    return mosques.filter((m) => {
      const matchesLocality =
        localityFilter === 'all' || m.locality.trim() === localityFilter;
      if (!matchesLocality) return false;
      if (!q) return true;
      return (
        normalizeArabicName(m.officialName).includes(q) ||
        normalizeArabicName(m.commonName).includes(q) ||
        normalizeArabicName(m.landmark).includes(q)
      );
    });
  }, [mosques, searchTerm, localityFilter]);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setActionError('');
    setDeleting(true);
    try {
      await deleteMosque(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'تعذّر حذف السجل.');
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyMapsUrl = async (mosque: MosqueRecord) => {
    try {
      await navigator.clipboard.writeText(mosque.mapsUrl);
      setCopiedId(mosque.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setActionError('تعذّر نسخ الرابط.');
    }
  };

  const handleCopyNameQuietly = async (officialName: string) => {
    try {
      await navigator.clipboard.writeText(officialName);
    } catch {
      // ignore
    }
  };

  const getGoogleSuggestUrl = (mosque: MosqueRecord) =>
    mosque.googlePlaceId
      ? generateGooglePlaceUrl(mosque.lat, mosque.lng, mosque.googlePlaceId)
      : mosque.mapsUrl;

  const handleShareMosque = async (mosque: MosqueRecord) => {
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
        setCopiedId(mosque.id);
        window.setTimeout(() => setCopiedId(null), 2000);
      }
    } catch {
      // dismissed
    }
  };

  const canModify = (mosque: MosqueRecord) =>
    currentUser.role === 'admin' || mosque.createdBy === currentUser.uid;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-5 pb-24 space-y-4">
      {/* Top Counter & Excel Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#0F4C3A] tabular-nums">
            عدد المساجد الموثقة: {filteredMosques.length}
          </h1>
          {localityFilter !== 'all' || searchTerm.trim() ? (
            <p className="text-xs text-[#5A6561] tabular-nums mt-0.5">
              الإجمالي الكلي: {mosques.length}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => exportMosquesToKml(filteredMosques)}
            disabled={filteredMosques.length === 0}
            title="تنزيل ملف KML للاستيراد في Google My Maps"
            className="min-h-[44px] px-3.5 rounded-xl bg-white border border-[#D8D4C8] text-[#0F4C3A] font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 hover:bg-[#FAF8F4] disabled:opacity-50 active:scale-[0.99] transition whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-[#C9A24B]" />
            <span>تصدير KML</span>
          </button>

          <button
            type="button"
            onClick={() => exportMosquesToCsv(filteredMosques)}
            disabled={filteredMosques.length === 0}
            title="تنزيل ملف CSV للاستيراد في Google My Maps"
            className="min-h-[44px] px-3.5 rounded-xl bg-white border border-[#D8D4C8] text-[#0F4C3A] font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 hover:bg-[#FAF8F4] disabled:opacity-50 active:scale-[0.99] transition whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-[#C9A24B]" />
            <span>تصدير CSV</span>
          </button>

          {GOOGLE_SHEETS_AVAILABLE && (
          <button
            type="button"
            onClick={() => setSheetsModalOpen(true)}
            title="ربط ومزامنة المساجد مع Google Sheets"
            className="min-h-[44px] px-3.5 rounded-xl bg-white border border-[#0F4C3A] text-[#0F4C3A] font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 hover:bg-[#0F4C3A]/5 active:scale-[0.99] transition whitespace-nowrap"
          >
            <Sheet className="w-4 h-4 text-[#0F4C3A]" />
            <span>Google Sheets</span>
          </button>
          )}

          {currentUser.role === 'admin' && (
            <button
              type="button"
              onClick={() => exportMosquesToExcel(filteredMosques)}
              disabled={filteredMosques.length === 0}
              className="col-span-2 min-h-[44px] px-4 rounded-xl bg-[#0F4C3A] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-[#0B3A2C] disabled:opacity-50 active:scale-[0.99] transition whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#C9A24B]" />
              <span>تصدير إلى Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* Linked Google Sheets Quick Status Bar */}
      {sheetConfig?.spreadsheetId && (
        <div className="bg-white border border-[#0F4C3A]/20 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#0F4C3A]/10 text-[#0F4C3A] flex items-center justify-center shrink-0">
              <Sheet className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-[#1A2421] truncate">
                مرتبط بجدول: {sheetConfig.spreadsheetTitle} ({sheetConfig.sheetName})
              </p>
              <p className="text-[11px] text-[#5A6561] tabular-nums">
                آخر مزامنة: {sheetConfig.lastSyncedCount} مسجد
                {sheetConfig.lastSyncedAt ? ` · ${formatEnglishDate(sheetConfig.lastSyncedAt)}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={sheetConfig.spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[38px] px-3 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-[#0F4C3A] text-xs font-bold flex items-center gap-1.5 hover:bg-[#EFECE4]"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>فتح الجدول</span>
            </a>
            <button
              type="button"
              onClick={() => setSheetsModalOpen(true)}
              className="min-h-[38px] px-3 rounded-xl bg-[#0F4C3A] text-white text-xs font-bold hover:bg-[#0B3A2C]"
            >
              مزامنة / استيراد
            </button>
          </div>
        </div>
      )}

      {/* Search & Locality Filter */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 text-[#5A6561] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث باسم المسجد أو العلامة الدالة..."
            className="w-full h-12 pr-10 pl-3.5 rounded-xl border border-[#D8D4C8] bg-white text-base sm:text-sm focus:outline-none focus:border-[#0F4C3A]"
          />
        </div>

        <select
          value={localityFilter}
          onChange={(e) => setLocalityFilter(e.target.value)}
          aria-label="فلترة حسب المحلة"
          className="h-12 px-3.5 rounded-xl border border-[#D8D4C8] bg-white text-base sm:text-sm focus:outline-none focus:border-[#0F4C3A]"
        >
          <option value="all">كل المحلات والمناطق</option>
          {localities.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>
      </div>

      {actionError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
          {actionError}
        </div>
      )}

      {/* Loading / Empty States */}
      {loading ? (
        <div className="bg-white border border-[#E5E2D9] rounded-2xl p-10 text-center text-sm text-[#5A6561]">
          جاري تحميل قائمة المساجد...
        </div>
      ) : filteredMosques.length === 0 ? (
        <div className="bg-white border border-[#E5E2D9] rounded-2xl p-10 text-center space-y-2">
          <MapPin className="w-8 h-8 text-[#C9A24B] mx-auto" />
          <p className="text-base font-bold text-[#1A2421]">لا توجد مساجد مطابقة</p>
          <p className="text-sm text-[#5A6561]">
            {mosques.length === 0
              ? 'ابدأ من تبويب «إضافة» لتوثيق أول مسجد.'
              : 'جرّب تغيير نص البحث أو اختيار محلة أخرى.'}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile Cards */}
          <div className="grid grid-cols-1 gap-3 lg:hidden">
            {filteredMosques.map((m) => {
              const allowed = canModify(m);
              const isCopied = copiedId === m.id;
              return (
                <article
                  key={m.id}
                  className="bg-white border border-[#E5E2D9] rounded-2xl p-4 space-y-3"
                >
                  <div>
                    <h2 className="text-base font-bold text-[#0F4C3A] leading-snug">
                      {m.officialName}
                    </h2>
                    {m.commonName && (
                      <p className="text-xs text-[#5A6561] mt-0.5">
                        المتداول: {m.commonName}
                      </p>
                    )}
                  </div>

                  <div className="text-xs text-[#4A5552] space-y-1">
                    <p>
                      <span className="font-semibold text-[#1A2421]">المحلة:</span> {m.locality}
                    </p>
                    {m.landmark && (
                      <p>
                        <span className="font-semibold text-[#1A2421]">علامة دالة:</span> {m.landmark}
                      </p>
                    )}
                    {m.notes && (
                      <p>
                        <span className="font-semibold text-[#1A2421]">ملاحظات:</span> {m.notes}
                      </p>
                    )}
                  </div>

                  {/* Prominent Google Maps Link, Edit Suggestion & Public Sharing Box */}
                  <div className="p-2.5 rounded-xl bg-[#0F4C3A]/5 border border-[#0F4C3A]/15 space-y-2">
                    <a
                      href={m.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      dir="ltr"
                      className="block text-[11px] font-mono text-[#0F4C3A] underline truncate bg-white px-2.5 py-1.5 rounded-lg border border-[#D8D4C8]"
                    >
                      {m.mapsUrl}
                    </a>
                    <div className="grid grid-cols-2 gap-1.5">
                      <a
                        href={getGoogleSuggestUrl(m)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => void handleCopyNameQuietly(m.officialName)}
                        title="ينسخ الاسم تلقائياً ويفتح خرائط جوجل للضغط على «اقتراح تعديل»"
                        className="min-h-[42px] px-2.5 rounded-lg bg-[#0F4C3A] text-white text-xs font-bold flex items-center justify-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span>نسخ وفتح جوجل للتعديل</span>
                      </a>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleCopyMapsUrl(m)}
                          className="min-h-[42px] px-2 rounded-lg bg-white border border-[#D8D4C8] text-xs font-semibold text-[#1A2421] flex items-center justify-center gap-1"
                        >
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-[#0F4C3A]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-[#0F4C3A]" />
                          )}
                          <span>{isCopied ? 'نُسخ' : 'نسخ'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleShareMosque(m)}
                          className="min-h-[42px] px-2 rounded-lg bg-white border border-[#D8D4C8] text-xs font-semibold text-[#0F4C3A] flex items-center justify-center gap-1"
                        >
                          <Share2 className="w-3.5 h-3.5 text-[#C9A24B]" />
                          <span>مشاركة</span>
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#5A6561] flex items-center gap-1">
                      <Info className="w-3.5 h-3.5 text-[#C9A24B] shrink-0" />
                      <span>بعد الفتح اضغط على «اقتراح تعديل» في خرائط جوجل</span>
                    </p>
                    {osmSettings.osmPublishEnabled && (
                      <button
                        type="button"
                        onClick={() => setPublishTarget(m)}
                        className="w-full min-h-[40px] px-3 rounded-lg bg-[#1A2421] text-white text-xs font-bold flex items-center justify-center gap-1.5"
                      >
                        <Globe className="w-3.5 h-3.5 text-[#C9A24B]" />
                        <span>نشر إلى OpenStreetMap</span>
                      </button>
                    )}
                  </div>

                  <div className="pt-2 border-t border-[#EFECE4] flex items-center justify-between gap-2">
                    <div className="text-[11px] text-[#5A6561] tabular-nums">
                      <span>{m.createdByName}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{formatEnglishDate(m.createdAt)}</span>
                      <span aria-hidden="true"> · </span>
                      <span>صور: {m.photoCount}</span>
                      {m.hasPendingWrites && (
                        <span className="text-amber-700 font-semibold"> · بانتظار الرفع</span>
                      )}
                    </div>

                    {allowed && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onEditMosque(m)}
                          aria-label={`تعديل ${m.officialName}`}
                          className="min-h-[40px] min-w-[40px] rounded-xl bg-[#FAF8F4] border border-[#D8D4C8] text-[#0F4C3A] flex items-center justify-center"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(m)}
                          aria-label={`حذف ${m.officialName}`}
                          className="min-h-[40px] min-w-[40px] rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block bg-white border border-[#E5E2D9] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-[#0F4C3A] text-white text-xs font-bold">
                    <th className="py-3 px-4">م</th>
                    <th className="py-3 px-4">اسم المسجد</th>
                    <th className="py-3 px-4">المحلة / المنطقة</th>
                    <th className="py-3 px-4">رابط خرائط جوجل (للمشاركة)</th>
                    <th className="py-3 px-4">علامة دالة</th>
                    <th className="py-3 px-4">الصور</th>
                    <th className="py-3 px-4">الموثِّق</th>
                    <th className="py-3 px-4">التاريخ</th>
                    <th className="py-3 px-4 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFECE4] text-sm">
                  {filteredMosques.map((m, idx) => {
                    const allowed = canModify(m);
                    const isCopied = copiedId === m.id;
                    return (
                      <tr key={m.id} className="hover:bg-[#FAF8F4]/70 transition-colors">
                        <td className="py-3 px-4 tabular-nums text-[#5A6561]">{idx + 1}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#1A2421]">{m.officialName}</div>
                          {m.commonName && (
                            <div className="text-xs text-[#5A6561]">{m.commonName}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[#1A2421]">{m.locality}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <a
                              href={m.mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              dir="ltr"
                              className="text-xs font-mono text-[#0F4C3A] underline max-w-[190px] truncate"
                            >
                              {m.mapsUrl}
                            </a>
                            <button
                              type="button"
                              onClick={() => void handleCopyMapsUrl(m)}
                              title="نسخ الرابط"
                              className="min-h-[30px] min-w-[30px] rounded-md border border-[#D8D4C8] bg-white text-[#0F4C3A] flex items-center justify-center hover:bg-[#FAF8F4]"
                            >
                              {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleShareMosque(m)}
                              title="مشاركة مع الجمهور"
                              className="min-h-[30px] min-w-[30px] rounded-md border border-[#D8D4C8] bg-white text-[#0F4C3A] flex items-center justify-center hover:bg-[#FAF8F4]"
                            >
                              <Share2 className="w-3.5 h-3.5 text-[#C9A24B]" />
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[#4A5552] max-w-xs truncate">
                          {m.landmark || '—'}
                        </td>
                        <td className="py-3 px-4 tabular-nums text-[#4A5552]">{m.photoCount}</td>
                        <td className="py-3 px-4 text-[#4A5552]">{m.createdByName}</td>
                        <td className="py-3 px-4 tabular-nums text-[#5A6561]">
                          {formatEnglishDate(m.createdAt)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <a
                              href={getGoogleSuggestUrl(m)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => void handleCopyNameQuietly(m.officialName)}
                              title="ينسخ الاسم تلقائياً ويفتح خرائط جوجل للضغط على «اقتراح تعديل»"
                              className="min-h-[36px] px-2.5 rounded-lg border border-[#D8D4C8] text-[#0F4C3A] text-xs font-bold hover:bg-[#FAF8F4] flex items-center justify-center gap-1 whitespace-nowrap"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>نسخ وفتح جوجل للتعديل</span>
                            </a>
                            {osmSettings.osmPublishEnabled && (
                              <button
                                type="button"
                                onClick={() => setPublishTarget(m)}
                                title="نشر إلى OpenStreetMap"
                                className="min-h-[36px] px-2.5 rounded-lg bg-[#1A2421] text-white text-xs font-bold hover:bg-[#0F4C3A] flex items-center justify-center gap-1 whitespace-nowrap"
                              >
                                <Globe className="w-3.5 h-3.5 text-[#C9A24B]" />
                                <span>نشر إلى OSM</span>
                              </button>
                            )}
                            {allowed && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onEditMosque(m)}
                                  title="تعديل"
                                  className="min-h-[36px] min-w-[36px] rounded-lg border border-[#D8D4C8] text-[#0F4C3A] hover:bg-[#FAF8F4] flex items-center justify-center"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(m)}
                                  title="حذف"
                                  className="min-h-[36px] min-w-[36px] rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 flex items-center justify-center"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="تأكيد حذف السجل"
        description={
          deleteTarget
            ? `هل أنت متأكد من حذف سجل «${deleteTarget.officialName}» نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`
            : ''
        }
        confirmLabel="حذف المسجد"
        danger
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
      />

      {publishTarget && (
        <OsmPublishModal
          mosque={publishTarget}
          osmSettings={osmSettings}
          currentUser={currentUser}
          onClose={() => setPublishTarget(null)}
        />
      )}

      <GoogleSheetsModal
        open={sheetsModalOpen}
        onClose={() => setSheetsModalOpen(false)}
        mosques={mosques}
        currentUser={currentUser}
        sheetConfig={sheetConfig}
      />
    </div>
  );
}
