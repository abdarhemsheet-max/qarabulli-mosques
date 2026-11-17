import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CloudUpload,
  DownloadCloud,
  ExternalLink,
  FilePlus2,
  FolderOpen,
  Link2,
  Loader2,
  RefreshCw,
  Sheet,
  X,
} from 'lucide-react';
import {
  connectGoogleSheetsAccess,
  subscribeWorkspaceToken,
  translateAuthError,
} from '../lib/firebase/auth';
import { createMosque } from '../lib/firebase/mosques';
import { saveGoogleSheetsConfig } from '../lib/firebase/sheetsConfig';
import {
  buildMosquePayloadFromSheetRow,
  createAwqafSpreadsheet,
  fetchSpreadsheetMeta,
  listDriveSpreadsheets,
  parseSpreadsheetId,
  readRowsFromGoogleSheet,
  syncMosquesToGoogleSheet,
  type DriveSpreadsheetItem,
  type ParsedSheetMosqueRow,
  type SpreadsheetMeta,
} from '../lib/google/sheetsSync';
import { formatEnglishDate, haversineDistanceMeters } from '../lib/utils/geo';
import type {
  GoogleSheetsConfig,
  MosqueRecord,
  UserProfile,
} from '../types/mosque';
import { ConfirmModal } from './ConfirmModal';

interface GoogleSheetsModalProps {
  open: boolean;
  onClose: () => void;
  mosques: MosqueRecord[];
  currentUser: UserProfile;
  sheetConfig: GoogleSheetsConfig | null;
}

type ConfirmAction =
  | { type: 'export' }
  | { type: 'import'; rows: ParsedSheetMosqueRow[] }
  | null;

function GoogleLogoSvg() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function normalizeArabicName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

export function GoogleSheetsModal({
  open,
  onClose,
  mosques,
  currentUser,
  sheetConfig,
}: GoogleSheetsModalProps) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const [selectedMeta, setSelectedMeta] = useState<SpreadsheetMeta | null>(null);
  const [selectedSheetName, setSelectedSheetName] = useState('');
  const [loadingMeta, setLoadingMeta] = useState(false);

  const [newSheetTitle, setNewSheetTitle] = useState('مساجد مكتب أوقاف القره بوللي');
  const [creatingSheet, setCreatingSheet] = useState(false);

  const [driveFiles, setDriveFiles] = useState<DriveSpreadsheetItem[]>([]);
  const [driveLoaded, setDriveLoaded] = useState(false);
  const [loadingDrive, setLoadingDrive] = useState(false);

  const [manualInput, setManualInput] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [readingRows, setReadingRows] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const [importPreview, setImportPreview] = useState<{
    totalRead: number;
    alreadyExistsCount: number;
    newRows: ParsedSheetMosqueRow[];
  } | null>(null);

  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    return subscribeWorkspaceToken(setAccessToken);
  }, []);

  // Auto-load current office spreadsheet metadata when opened with a valid token
  useEffect(() => {
    if (!open || !accessToken || !sheetConfig?.spreadsheetId) return;
    if (selectedMeta?.spreadsheetId === sheetConfig.spreadsheetId) return;

    let cancelled = false;
    setLoadingMeta(true);
    setErrorMsg('');

    void fetchSpreadsheetMeta(accessToken, sheetConfig.spreadsheetId)
      .then((meta) => {
        if (cancelled) return;
        setSelectedMeta(meta);
        const matchingTab = meta.sheets.find((s) => s.title === sheetConfig.sheetName);
        setSelectedSheetName(matchingTab?.title ?? meta.sheets[0]?.title ?? '');
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : 'تعذّر قراءة بيانات الجدول المرتبط.');
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, accessToken, sheetConfig?.spreadsheetId, sheetConfig?.sheetName, selectedMeta?.spreadsheetId]);

  const activeSpreadsheetUrl = useMemo(() => {
    return selectedMeta?.spreadsheetUrl || sheetConfig?.spreadsheetUrl || '';
  }, [selectedMeta?.spreadsheetUrl, sheetConfig?.spreadsheetUrl]);

  const activeSpreadsheetTitle = useMemo(() => {
    return selectedMeta?.title || sheetConfig?.spreadsheetTitle || '';
  }, [selectedMeta?.title, sheetConfig?.spreadsheetTitle]);

  const selectedSheetInfo = useMemo(() => {
    return selectedMeta?.sheets.find((s) => s.title === selectedSheetName);
  }, [selectedMeta?.sheets, selectedSheetName]);

  if (!open) return null;

  const handleConnectGoogle = async () => {
    setErrorMsg('');
    setStatusMsg('');
    setConnecting(true);
    try {
      await connectGoogleSheetsAccess();
      setStatusMsg('تم ربط حساب Google بنجاح. يمكنك الآن إنشاء جدول أو المزامنة.');
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      setErrorMsg(code ? translateAuthError(err) : err instanceof Error ? err.message : 'تعذّر الربط بحساب Google.');
    } finally {
      setConnecting(false);
    }
  };

  const handleCreateNewSheet = async () => {
    if (!accessToken) return;
    setErrorMsg('');
    setStatusMsg('');
    setImportPreview(null);
    setCreatingSheet(true);
    try {
      const meta = await createAwqafSpreadsheet(accessToken, newSheetTitle);
      const firstTab = meta.sheets[0]?.title ?? '';
      setSelectedMeta(meta);
      setSelectedSheetName(firstTab);

      await saveGoogleSheetsConfig(
        {
          spreadsheetId: meta.spreadsheetId,
          spreadsheetTitle: meta.title,
          spreadsheetUrl: meta.spreadsheetUrl,
          sheetName: firstTab,
          lastSyncedCount: 0,
        },
        currentUser
      );

      setStatusMsg(`تم إنشاء الملف «${meta.title}» وربطه بالمنظومة. اضغط على «مزامنة البيانات إلى Google Sheets» لرفع المساجد إليه.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذّر إنشاء ملف Google Sheets.');
    } finally {
      setCreatingSheet(false);
    }
  };

  const handleLoadDriveFiles = async () => {
    if (!accessToken) return;
    setErrorMsg('');
    setLoadingDrive(true);
    try {
      const files = await listDriveSpreadsheets(accessToken);
      setDriveFiles(files);
      setDriveLoaded(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذّر جلب الملفات من Google Drive.');
    } finally {
      setLoadingDrive(false);
    }
  };

  const handleSelectSpreadsheetId = async (spreadsheetId: string) => {
    if (!accessToken) return;
    setErrorMsg('');
    setStatusMsg('');
    setImportPreview(null);
    setLoadingMeta(true);
    try {
      const meta = await fetchSpreadsheetMeta(accessToken, spreadsheetId);
      setSelectedMeta(meta);
      const preferredTab =
        meta.sheets.find((s) => s.title === sheetConfig?.sheetName)?.title ??
        meta.sheets[0]?.title ??
        '';
      setSelectedSheetName(preferredTab);
      await saveGoogleSheetsConfig(
        {
          spreadsheetId: meta.spreadsheetId,
          spreadsheetTitle: meta.title,
          spreadsheetUrl: meta.spreadsheetUrl,
          sheetName: preferredTab,
          lastSyncedCount: sheetConfig?.lastSyncedCount ?? 0,
        },
        currentUser
      );
      setStatusMsg(`تم ربط الملف «${meta.title}» (ورقة: ${preferredTab}).`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذّر فتح الملف المحدد.');
    } finally {
      setLoadingMeta(false);
    }
  };

  const handleAttachManualUrl = async () => {
    const id = parseSpreadsheetId(manualInput);
    if (!id) {
      setErrorMsg('يرجى لصق رابط Google Sheets صحيح أو معرّف الجدول.');
      return;
    }
    await handleSelectSpreadsheetId(id);
    setManualInput('');
  };

  const handleChangeTabName = async (nextTab: string) => {
    setSelectedSheetName(nextTab);
    setImportPreview(null);
    if (selectedMeta && nextTab) {
      try {
        await saveGoogleSheetsConfig(
          {
            spreadsheetId: selectedMeta.spreadsheetId,
            spreadsheetTitle: selectedMeta.title,
            spreadsheetUrl: selectedMeta.spreadsheetUrl,
            sheetName: nextTab,
            lastSyncedCount: sheetConfig?.lastSyncedCount ?? 0,
          },
          currentUser
        );
      } catch {
        // Non-fatal
      }
    }
  };

  const executeConfirmedExport = async () => {
    if (!accessToken || !selectedMeta || !selectedSheetName) return;
    setErrorMsg('');
    setStatusMsg('');
    setSyncing(true);
    try {
      const { writtenCount } = await syncMosquesToGoogleSheet({
        accessToken,
        spreadsheetId: selectedMeta.spreadsheetId,
        sheetName: selectedSheetName,
        sheetId: selectedSheetInfo?.sheetId,
        mosques,
      });

      await saveGoogleSheetsConfig(
        {
          spreadsheetId: selectedMeta.spreadsheetId,
          spreadsheetTitle: selectedMeta.title,
          spreadsheetUrl: selectedMeta.spreadsheetUrl,
          sheetName: selectedSheetName,
          lastSyncedCount: writtenCount,
        },
        currentUser
      );

      setConfirmAction(null);
      setStatusMsg(`تمت مزامنة ${writtenCount} مسجداً بنجاح إلى «${selectedMeta.title}» (${selectedSheetName}).`);
    } catch (err) {
      setConfirmAction(null);
      setErrorMsg(err instanceof Error ? err.message : 'تعذّرت مزامنة البيانات إلى Google Sheets.');
    } finally {
      setSyncing(false);
    }
  };

  const handleInspectSheetImport = async () => {
    if (!accessToken || !selectedMeta || !selectedSheetName) return;
    setErrorMsg('');
    setStatusMsg('');
    setImportPreview(null);
    setReadingRows(true);
    try {
      const rows = await readRowsFromGoogleSheet(
        accessToken,
        selectedMeta.spreadsheetId,
        selectedSheetName
      );

      const newRows = rows.filter((row) => {
        const normName = normalizeArabicName(row.officialName);
        return !mosques.some((existing) => {
          if (row.googlePlaceId && existing.googlePlaceId === row.googlePlaceId) {
            return true;
          }
          if (
            normalizeArabicName(existing.officialName) === normName &&
            normalizeArabicName(existing.locality) === normalizeArabicName(row.locality)
          ) {
            return true;
          }
          return haversineDistanceMeters(row.lat, row.lng, existing.lat, existing.lng) <= 30;
        });
      });

      setImportPreview({
        totalRead: rows.length,
        alreadyExistsCount: rows.length - newRows.length,
        newRows,
      });

      if (rows.length === 0) {
        setStatusMsg('الورقة المحددة فارغة أو لا تحتوي على صفوف صالحة بالإحداثيات.');
      } else if (newRows.length === 0) {
        setStatusMsg(`تمت قراءة ${rows.length} صفاً — جميعها موجودة مسبقاً في قاعدة بيانات المنظومة.`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذّرت قراءة الصفوف من Google Sheet.');
    } finally {
      setReadingRows(false);
    }
  };

  const executeConfirmedImport = async (rowsToImport: ParsedSheetMosqueRow[]) => {
    setErrorMsg('');
    setStatusMsg('');
    setSyncing(true);
    try {
      let imported = 0;
      for (const row of rowsToImport) {
        await createMosque(buildMosquePayloadFromSheetRow(row), currentUser);
        imported += 1;
      }
      setConfirmAction(null);
      setImportPreview(null);
      setStatusMsg(`تم استيراد ${imported} مسجداً جديداً من Google Sheet إلى المنظومة بنجاح.`);
    } catch (err) {
      setConfirmAction(null);
      setErrorMsg(err instanceof Error ? err.message : 'حدث خطأ أثناء استيراد بعض الصفوف.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label="الربط والمزامنة مع Google Sheets"
      >
        <div className="w-full sm:max-w-2xl bg-[#FAF8F4] sm:rounded-2xl rounded-t-2xl border border-[#E5E2D9] shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden">
          {/* Modal Header */}
          <div className="bg-white border-b border-[#E5E2D9] px-5 py-4 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#0F4C3A]/10 text-[#0F4C3A] flex items-center justify-center">
                <Sheet className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#0F4C3A]">
                  الربط والمزامنة مع Google Sheets
                </h2>
                <p className="text-xs text-[#5A6561]">
                  مزامنة قاعدة بيانات المساجد ({mosques.length} مسجداً) مع جدول Google Sheets للمكتب
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="min-h-[40px] min-w-[40px] rounded-xl border border-[#D8D4C8] text-[#4A5552] hover:bg-[#FAF8F4] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
            {/* Existing Office Link Card (visible anytime if saved in Firestore) */}
            {sheetConfig?.spreadsheetId && (
              <div className="bg-white border border-[#0F4C3A]/20 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0F4C3A] bg-[#0F4C3A]/10 px-2 py-0.5 rounded-md">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      ملف المكتب المرتبط حالياً
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-[#1A2421] mt-1">
                      {activeSpreadsheetTitle || sheetConfig.spreadsheetTitle}
                    </h3>
                    <p className="text-xs text-[#5A6561] mt-0.5 tabular-nums">
                      الورقة: <span className="font-semibold text-[#1A2421]">{selectedSheetName || sheetConfig.sheetName}</span>
                      {' · '}
                      آخر مزامنة: {sheetConfig.lastSyncedCount} مسجد
                      {sheetConfig.lastSyncedAt ? ` (${formatEnglishDate(sheetConfig.lastSyncedAt)})` : ''}
                    </p>
                  </div>

                  {activeSpreadsheetUrl && (
                    <a
                      href={activeSpreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] px-3 rounded-xl bg-[#0F4C3A] text-white text-xs font-bold flex items-center gap-1.5 hover:bg-[#0B3A2C] shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>فتح في Google Sheets</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Google Account Auth Section */}
            {!accessToken ? (
              <div className="bg-white border border-[#E5E2D9] rounded-2xl p-5 text-center space-y-3">
                <h3 className="text-sm sm:text-base font-bold text-[#1A2421]">
                  ربط جلسة Google Sheets
                </h3>
                <p className="text-xs sm:text-sm text-[#5A6561] leading-relaxed">
                  لإنشاء ملف جديد أو مزامنة البيانات مع Google Sheets، يرجى تسجيل الدخول بحساب Google ومنح صلاحية Google Drive و Google Sheets.
                </p>
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    onClick={() => void handleConnectGoogle()}
                    disabled={connecting}
                    className="min-h-[46px] px-5 rounded-xl bg-white border border-[#747775]/40 text-[#1F1F1F] font-semibold text-sm flex items-center justify-center gap-3 shadow-xs hover:bg-[#F8F9FA] active:scale-[0.99] transition disabled:opacity-60"
                  >
                    {connecting ? (
                      <Loader2 className="w-5 h-5 animate-spin text-[#0F4C3A]" />
                    ) : (
                      <GoogleLogoSvg />
                    )}
                    <span>
                      {connecting
                        ? 'جاري فتح نافذة Google...'
                        : 'تسجيل الدخول بحساب Google للربط مع Sheets'}
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Connected Account Status */}
                <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-emerald-900 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>جلسة Google Sheets نشطة وجاهزة للمزامنة</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleConnectGoogle()}
                    disabled={connecting}
                    className="text-xs font-bold text-[#0F4C3A] underline hover:opacity-80 shrink-0"
                  >
                    تغيير الحساب
                  </button>
                </div>

                {/* Sync Actions Panel when a spreadsheet & tab are selected */}
                {selectedMeta && (
                  <div className="bg-white border border-[#E5E2D9] rounded-2xl p-4 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-[#5A6561]">الملف النشط للعملية</p>
                        <p className="text-sm font-bold text-[#0F4C3A]">{selectedMeta.title}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <label
                          htmlFor="sheet-tab-select"
                          className="text-xs font-bold text-[#1A2421] whitespace-nowrap"
                        >
                          الورقة (Tab):
                        </label>
                        <select
                          id="sheet-tab-select"
                          value={selectedSheetName}
                          onChange={(e) => void handleChangeTabName(e.target.value)}
                          disabled={loadingMeta || selectedMeta.sheets.length === 0}
                          className="h-10 px-3 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-xs sm:text-sm font-semibold text-[#1A2421] focus:outline-none focus:border-[#0F4C3A]"
                        >
                          {selectedMeta.sheets.map((tab) => (
                            <option key={tab.sheetId} value={tab.title}>
                              {tab.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setConfirmAction({ type: 'export' })}
                        disabled={syncing || !selectedSheetName || mosques.length === 0}
                        className="min-h-[48px] px-4 rounded-xl bg-[#0F4C3A] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-[#0B3A2C] disabled:opacity-50 transition"
                      >
                        <CloudUpload className="w-4 h-4 text-[#C9A24B]" />
                        <span>مزامنة البيانات إلى Google Sheets ({mosques.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleInspectSheetImport()}
                        disabled={readingRows || syncing || !selectedSheetName}
                        className="min-h-[48px] px-4 rounded-xl bg-white border border-[#0F4C3A] text-[#0F4C3A] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-[#0F4C3A]/5 disabled:opacity-50 transition"
                      >
                        {readingRows ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <DownloadCloud className="w-4 h-4" />
                        )}
                        <span>قراءة من Sheet واستيراد الجديد</span>
                      </button>
                    </div>

                    {/* Import Preview Card */}
                    {importPreview && importPreview.newRows.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2.5">
                        <div className="text-xs sm:text-sm text-amber-950 space-y-1">
                          <p className="font-bold">
                            نتيجة فحص الورقة «{selectedSheetName}»:
                          </p>
                          <p>
                            تمت قراءة {importPreview.totalRead} صفاً، منها{' '}
                            <span className="font-bold text-[#0F4C3A]">
                              {importPreview.newRows.length} مسجداً جديداً
                            </span>{' '}
                            غير موجود في قاعدة بيانات المنظومة (و{importPreview.alreadyExistsCount} موجود مسبقاً).
                          </p>
                        </div>

                        <div className="max-h-32 overflow-y-auto bg-white rounded-lg border border-amber-200 divide-y divide-[#EFECE4] text-xs">
                          {importPreview.newRows.slice(0, 10).map((r) => (
                            <div key={r.rowNumber} className="px-3 py-1.5 flex items-center justify-between gap-2">
                              <span className="font-bold text-[#1A2421] truncate">{r.officialName}</span>
                              <span className="text-[#5A6561] shrink-0">{r.locality}</span>
                            </div>
                          ))}
                          {importPreview.newRows.length > 10 && (
                            <div className="px-3 py-1.5 text-center text-[#5A6561]">
                              و {importPreview.newRows.length - 10} صفاً آخر...
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({ type: 'import', rows: importPreview.newRows })
                          }
                          className="w-full min-h-[42px] rounded-xl bg-[#0F4C3A] text-white font-bold text-xs sm:text-sm hover:bg-[#0B3A2C]"
                        >
                          تأكيد استيراد {importPreview.newRows.length} مسجداً إلى المنظومة
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Choose / Create / Attach Spreadsheet Options */}
                <div className="bg-white border border-[#E5E2D9] rounded-2xl p-4 space-y-4">
                  <h3 className="text-sm font-bold text-[#1A2421]">
                    {selectedMeta ? 'تغيير جدول Google Sheets المرتبط' : 'اختر أو أنشئ جدول Google Sheets'}
                  </h3>

                  {/* Option 1: Create New Spreadsheet */}
                  <div className="p-3 rounded-xl bg-[#FAF8F4] border border-[#E5E2D9] space-y-2">
                    <label
                      htmlFor="new-sheet-title"
                      className="text-xs font-bold text-[#0F4C3A] flex items-center gap-1.5"
                    >
                      <FilePlus2 className="w-4 h-4" />
                      <span>1. إنشاء ملف Google Sheets جديد للمكتب</span>
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        id="new-sheet-title"
                        type="text"
                        value={newSheetTitle}
                        onChange={(e) => setNewSheetTitle(e.target.value)}
                        placeholder="اسم ملف Google Sheets"
                        className="flex-1 h-11 px-3 rounded-xl border border-[#D8D4C8] bg-white text-sm focus:outline-none focus:border-[#0F4C3A]"
                      />
                      <button
                        type="button"
                        onClick={() => void handleCreateNewSheet()}
                        disabled={creatingSheet || !newSheetTitle.trim()}
                        className="min-h-[44px] px-4 rounded-xl bg-[#0F4C3A] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 hover:bg-[#0B3A2C] disabled:opacity-50 whitespace-nowrap"
                      >
                        {creatingSheet ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <FilePlus2 className="w-4 h-4 text-[#C9A24B]" />
                        )}
                        <span>إنشاء وربط ملف جديد</span>
                      </button>
                    </div>
                  </div>

                  {/* Option 2: Pick from Google Drive */}
                  <div className="p-3 rounded-xl bg-[#FAF8F4] border border-[#E5E2D9] space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#0F4C3A] flex items-center gap-1.5">
                        <FolderOpen className="w-4 h-4" />
                        <span>2. اختيار جدول موجود من Google Drive</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleLoadDriveFiles()}
                        disabled={loadingDrive}
                        className="min-h-[36px] px-3 rounded-lg bg-white border border-[#D8D4C8] text-[#0F4C3A] text-xs font-bold flex items-center gap-1.5 hover:bg-[#FAF8F4]"
                      >
                        {loadingDrive ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        <span>{driveLoaded ? 'تحديث القائمة' : 'عرض ملفاتي في Drive'}</span>
                      </button>
                    </div>

                    {driveLoaded && (
                      <div className="max-h-40 overflow-y-auto bg-white border border-[#D8D4C8] rounded-xl divide-y divide-[#EFECE4]">
                        {driveFiles.length === 0 ? (
                          <p className="p-3 text-xs text-[#5A6561] text-center">
                            لا توجد جداول Google Sheets في حساب Drive الحالي.
                          </p>
                        ) : (
                          driveFiles.map((file) => (
                            <button
                              key={file.id}
                              type="button"
                              onClick={() => void handleSelectSpreadsheetId(file.id)}
                              disabled={loadingMeta}
                              className="w-full px-3 py-2.5 text-right hover:bg-[#0F4C3A]/5 flex items-center justify-between gap-2 transition"
                            >
                              <span className="text-xs sm:text-sm font-semibold text-[#1A2421] truncate">
                                {file.name}
                              </span>
                              <span className="text-[11px] font-bold text-[#0F4C3A] shrink-0">
                                {selectedMeta?.spreadsheetId === file.id ? 'مختار' : 'اختيار'}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Option 3: Paste Link or Spreadsheet ID */}
                  <div className="p-3 rounded-xl bg-[#FAF8F4] border border-[#E5E2D9] space-y-2">
                    <label
                      htmlFor="manual-sheet-url"
                      className="text-xs font-bold text-[#0F4C3A] flex items-center gap-1.5"
                    >
                      <Link2 className="w-4 h-4" />
                      <span>3. أو لصق رابط Google Sheets مباشر</span>
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        id="manual-sheet-url"
                        type="text"
                        dir="ltr"
                        value={manualInput}
                        onChange={(e) => setManualInput(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        className="flex-1 h-11 px-3 rounded-xl border border-[#D8D4C8] bg-white text-xs sm:text-sm font-mono focus:outline-none focus:border-[#0F4C3A]"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAttachManualUrl()}
                        disabled={loadingMeta || !manualInput.trim()}
                        className="min-h-[44px] px-4 rounded-xl bg-white border border-[#D8D4C8] text-[#0F4C3A] font-bold text-xs sm:text-sm hover:bg-[#FAF8F4] disabled:opacity-50 whitespace-nowrap"
                      >
                        {loadingMeta ? 'جاري التحقق...' : 'ربط الرابط'}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm">
                {errorMsg}
              </div>
            )}

            {statusMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm font-medium">
                {statusMsg}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Explicit Confirmation before any Google Sheets Overwrite or Firestore Bulk Import */}
      <ConfirmModal
        open={Boolean(confirmAction)}
        title={
          confirmAction?.type === 'export'
            ? 'تأكيد المزامنة إلى Google Sheets'
            : 'تأكيد استيراد المساجد من Google Sheet'
        }
        description={
          confirmAction?.type === 'export'
            ? `سيتم تحديث الصفوف (A:N) في الورقة «${selectedSheetName}» ضمن الملف «${selectedMeta?.title ?? ''}» بعدد (${mosques.length}) مسجداً من قاعدة بيانات المنظومة. هل تريد المتابعة؟`
            : confirmAction?.type === 'import'
              ? `سيتم إضافة (${confirmAction.rows.length}) مسجداً جديداً من الورقة «${selectedSheetName}» إلى قاعدة بيانات المنظومة. هل تريد تنفيذ الاستيراد؟`
              : ''
        }
        confirmLabel={
          confirmAction?.type === 'export'
            ? `مزامنة ${mosques.length} مسجد الآن`
            : `استيراد ${confirmAction?.type === 'import' ? confirmAction.rows.length : 0} مسجد`
        }
        loading={syncing}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction?.type === 'export') {
            void executeConfirmedExport();
          } else if (confirmAction?.type === 'import') {
            void executeConfirmedImport(confirmAction.rows);
          }
        }}
      />
    </>
  );
}
