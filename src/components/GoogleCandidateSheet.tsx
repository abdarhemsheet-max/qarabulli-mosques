import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  ImagePlus,
  Info,
  Mail,
  MapPin,
  Move,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { createMosque } from '../lib/supabase/mosques';
import { generateGooglePlaceUrl } from '../lib/maps/googleMosques';
import {
  generateGoogleMapsUrl,
  haversineDistanceMeters,
  normalizeArabicName,
} from '../lib/utils/geo';
import { compressImageToBase64 } from '../lib/utils/image';
import type {
  GoogleMosqueCandidate,
  MosqueFormValues,
  MosqueRecord,
  UserProfile,
} from '../types/mosque';
import { GooglePlaceDetailsBlock } from './GooglePlaceDetailsBlock';

interface GoogleCandidateSheetProps {
  candidate: GoogleMosqueCandidate | null;
  existingMosques: MosqueRecord[];
  currentUser: UserProfile;
  onClose: () => void;
  onSwitchToEditExisting?: (mosque: MosqueRecord) => void;
  onMovePinAndOpenForm?: (candidate: GoogleMosqueCandidate, editedName?: string) => void;
}

interface DuplicateCandidate {
  mosque: MosqueRecord;
  reason: 'name' | 'distance';
  distanceMeters: number;
}

const QUICK_STATUS_NOTES = [
  'الاسم في جوجل غير صحيح وتم تصحيحه',
  'الموقع في جوجل غير دقيق',
  'مغلق مؤقتاً / للصيانة',
  'قيد الإنشاء',
];

const LAST_LOCALITY_KEY = 'qarabulli_last_locality';
const GMAIL_MAPS_SEARCH_URL = 'https://mail.google.com/mail/u/0/#search/Google+Maps';

function getStoredLocality(): string {
  try {
    return (window.localStorage.getItem(LAST_LOCALITY_KEY) ?? '').trim();
  } catch {
    return '';
  }
}

function saveStoredLocality(value: string): void {
  try {
    if (value.trim()) {
      window.localStorage.setItem(LAST_LOCALITY_KEY, value.trim());
    }
  } catch {
    // ignore storage quota
  }
}

export function GoogleCandidateSheet({
  candidate,
  existingMosques,
  currentUser,
  onClose,
  onSwitchToEditExisting,
  onMovePinAndOpenForm,
}: GoogleCandidateSheetProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'edit'>('details');

  // In-app edit form state (mirrors Google Maps "تعديل المعلومات" & saves directly to Awqaf Firestore)
  const [officialName, setOfficialName] = useState('');
  const [commonName, setCommonName] = useState('');
  const [locality, setLocality] = useState('');
  const [isCustomLocality, setIsCustomLocality] = useState(false);
  const [customLocality, setCustomLocality] = useState('');
  const [landmark, setLandmark] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  const [compressingPhoto, setCompressingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [duplicateAlert, setDuplicateAlert] = useState<DuplicateCandidate | null>(null);
  const [savedRecord, setSavedRecord] = useState<{
    officialName: string;
    locality: string;
    pendingSync: boolean;
    mapsUrl: string;
  } | null>(null);
  const [copiedEditedName, setCopiedEditedName] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const knownLocalities = useMemo(() => {
    const set = new Set<string>();
    existingMosques.forEach((m) => {
      if (m.locality.trim()) set.add(m.locality.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [existingMosques]);

  useEffect(() => {
    if (!candidate) return;
    setActiveTab('details');
    setOfficialName(candidate.displayName.trim());
    setCommonName('');

    const storedLoc = getStoredLocality();
    const matchedFromAddress = knownLocalities.find((loc) =>
      candidate.formattedAddress.includes(loc)
    );
    const initialKnownLoc =
      matchedFromAddress ||
      (storedLoc && knownLocalities.includes(storedLoc) ? storedLoc : knownLocalities[0] ?? '');

    if (knownLocalities.length > 0) {
      setLocality(initialKnownLoc);
      setIsCustomLocality(false);
      setCustomLocality('');
    } else {
      setLocality('');
      setIsCustomLocality(true);
      setCustomLocality(storedLoc || 'القره بوللي');
    }

    setLandmark('');
    setNotes(
      candidate.businessStatus === 'CLOSED_TEMPORARILY'
        ? 'مغلق مؤقتاً في خرائط جوجل'
        : candidate.businessStatus === 'CLOSED_PERMANENTLY'
          ? 'معلَّم كمغلق نهائياً في خرائط جوجل'
          : ''
    );
    setPhotos([]);
    setErrorMsg('');
    setDuplicateAlert(null);
    setSavedRecord(null);
    setCopiedEditedName(false);
  }, [candidate?.placeId]);

  if (!candidate) return null;

  const googleMapsUrl =
    candidate.googleMapsUri ||
    generateGooglePlaceUrl(candidate.lat, candidate.lng, candidate.placeId);
  const missingName = !candidate.displayName.trim();
  const resolvedLocality = (isCustomLocality ? customLocality : locality).trim();

  const handlePhotoFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMsg('');

    const remainingSlots = 3 - photos.length;
    if (remainingSlots <= 0) {
      setErrorMsg('الحد الأقصى للصور الميدانية هو 3 صور.');
      return;
    }

    const selectedFiles = Array.from(files).slice(0, remainingSlots);
    setCompressingPhoto(true);
    try {
      const compressed: string[] = [];
      for (const file of selectedFiles) {
        const base64 = await compressImageToBase64(file);
        compressed.push(base64);
      }
      setPhotos((prev) => [...prev, ...compressed].slice(0, 3));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذّر ضغط الصورة.');
    } finally {
      setCompressingPhoto(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  const toggleQuickNote = (chip: string) => {
    setNotes((prev) => {
      const lines = prev
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (lines.includes(chip)) {
        return lines.filter((l) => l !== chip).join('\n');
      }
      return [...lines, chip].join('\n');
    });
  };

  const findDuplicateCandidate = (): DuplicateCandidate | null => {
    const targetName = normalizeArabicName(officialName);
    let closestMatch: DuplicateCandidate | null = null;

    for (const m of existingMosques) {
      const dist = haversineDistanceMeters(candidate.lat, candidate.lng, m.lat, m.lng);
      const existingOfficial = normalizeArabicName(m.officialName);
      const existingCommon = normalizeArabicName(m.commonName);

      if (
        targetName &&
        (existingOfficial === targetName || (existingCommon && existingCommon === targetName))
      ) {
        return { mosque: m, reason: 'name', distanceMeters: Math.round(dist) };
      }

      if (dist < 30) {
        if (!closestMatch || dist < closestMatch.distanceMeters) {
          closestMatch = { mosque: m, reason: 'distance', distanceMeters: Math.round(dist) };
        }
      }
    }

    return closestMatch;
  };

  const performSave = async () => {
    setErrorMsg('');
    setSubmitting(true);

    const payload: MosqueFormValues = {
      officialName: officialName.trim(),
      commonName: commonName.trim(),
      locality: resolvedLocality,
      landmark: landmark.trim(),
      notes: notes.trim(),
      lat: candidate.lat,
      lng: candidate.lng,
      accuracy: 10,
      photos,
      googlePlaceId: candidate.placeId,
    };

    try {
      const res = await createMosque(payload, currentUser);
      saveStoredLocality(payload.locality);
      setSavedRecord({
        officialName: payload.officialName,
        locality: payload.locality,
        pendingSync: res.pendingSync,
        mapsUrl: generateGoogleMapsUrl(payload.lat, payload.lng),
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذّر حفظ بيانات المسجد.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickSaveOrOpenForm = async () => {
    setErrorMsg('');
    if (!officialName.trim() || !resolvedLocality) {
      setActiveTab('edit');
      setErrorMsg(
        !officialName.trim()
          ? 'يرجى كتابة اسم المسجد أولاً.'
          : 'يرجى تحديد المحلة / المنطقة ثم الحفظ.'
      );
      return;
    }

    const dup = findDuplicateCandidate();
    if (dup) {
      setDuplicateAlert(dup);
      setActiveTab('edit');
      return;
    }

    await performSave();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!officialName.trim()) {
      setErrorMsg('يرجى إدخال اسم المسجد باللغة العربية.');
      return;
    }
    if (!resolvedLocality) {
      setErrorMsg('يرجى اختيار المحلة / المنطقة أو كتابة محلة جديدة.');
      return;
    }

    const dup = findDuplicateCandidate();
    if (dup) {
      setDuplicateAlert(dup);
      return;
    }

    await performSave();
  };

  const handleEditDuplicate = () => {
    if (!duplicateAlert || !onSwitchToEditExisting) return;
    const target = duplicateAlert.mosque;
    const canEditTarget = currentUser.role === 'admin' || target.createdBy === currentUser.uid;
    if (!canEditTarget) {
      setErrorMsg(
        `المسجد "${target.officialName}" مسجّل باسم موثِّق آخر (${target.createdByName}) ولا يمكن تعديله إلا من قِبل صاحبه أو المدير.`
      );
      setDuplicateAlert(null);
      return;
    }
    setDuplicateAlert(null);
    onClose();
    onSwitchToEditExisting({
      ...target,
      googlePlaceId: target.googlePlaceId || candidate.placeId,
    });
  };

  const handleCopyNameText = async (nameToCopy: string) => {
    if (!nameToCopy.trim()) return;
    try {
      await navigator.clipboard.writeText(nameToCopy.trim());
      setCopiedEditedName(true);
      window.setTimeout(() => setCopiedEditedName(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleCopyEditedName = async () => {
    await handleCopyNameText(savedRecord?.officialName || officialName);
  };

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/45 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-[#E5E2D9] shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-[#D8D4C8]" />
        </div>

        {/* Header */}
        <div className="px-5 py-3 border-b border-[#EFECE4] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#B91C1C]">
              مسجد مسجل مسبقاً في خرائط جوجل (غير موثَّق في المنظومة)
            </p>
            <h2 className="text-lg font-bold text-[#1A2421] mt-0.5 leading-snug">
              {candidate.displayName || 'مسجد بدون اسم في خرائط جوجل'}
            </h2>
            <p className="text-xs text-[#5A6561] mt-1 flex items-center gap-1.5 tabular-nums">
              <MapPin className="w-3.5 h-3.5 text-[#DC2626] shrink-0" />
              <span dir="ltr">
                {candidate.lat.toFixed(6)}, {candidate.lng.toFixed(6)}
              </span>
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

        {/* Mode Switch Tabs (hidden once saved) */}
        {!savedRecord && (
          <div className="px-5 pt-3 pb-2 bg-[#FAF8F4] border-b border-[#EFECE4] grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`min-h-[40px] px-3 rounded-xl text-xs font-bold transition ${
                activeTab === 'details'
                  ? 'bg-[#0F4C3A] text-white shadow-xs'
                  : 'bg-white border border-[#D8D4C8] text-[#4A5552] hover:text-[#0F4C3A]'
              }`}
            >
              تفاصيل وصور جوجل
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('edit')}
              className={`min-h-[40px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                activeTab === 'edit'
                  ? 'bg-[#0F4C3A] text-white shadow-xs'
                  : 'bg-white border border-[#D8D4C8] text-[#0F4C3A] hover:bg-white'
              }`}
            >
              <Pencil className="w-3.5 h-3.5 text-[#C9A24B]" />
              <span>تعديل وحفظ في المنظومة</span>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {savedRecord ? (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-[#0F4C3A]/10 text-[#0F4C3A] flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#0F4C3A]">
                  تم حفظ التعديلات وتوثيق المسجد في المنظومة
                </h3>
                <p className="text-sm font-bold text-[#1A2421] mt-1">
                  {savedRecord.officialName}
                </p>
                <p className="text-xs text-[#5A6561] mt-0.5">{savedRecord.locality}</p>
                <p className="text-xs text-[#4A5552] mt-2 leading-relaxed">
                  {savedRecord.pendingSync
                    ? 'تم الحفظ محلياً وتحول الدبوس إلى اللون الأخضر في المنظومة، وسيُرفع تلقائياً عند عودة الاتصال.'
                    : 'ظهرت التعديلات مباشرة في خريطة المنظومة (دبوس أخضر موثَّق) وفي قائمة المساجد وملف التصدير.'}
                </p>
              </div>

              {/* Helper to submit the edit directly on Google Maps in 1 tap */}
              <div className="p-3.5 rounded-2xl bg-[#FAF8F4] border border-[#E5E2D9] space-y-2.5 text-right">
                <p className="text-xs font-bold text-[#1A2421]">
                  الخطوة الأسرع لإرسال التعديل إلى خرائط جوجل العامة:
                </p>
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => void handleCopyEditedName()}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#0F4C3A] text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#0B3A2C]"
                >
                  <ExternalLink className="w-4 h-4 text-[#C9A24B]" />
                  <span>نسخ الاسم وفتح خرائط جوجل للتعديل طوالي</span>
                </a>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopyEditedName()}
                    className="flex-1 min-h-[38px] px-3 rounded-xl bg-white border border-[#D8D4C8] text-xs font-bold text-[#0F4C3A] flex items-center justify-center gap-1.5 hover:bg-[#FAF8F4]"
                  >
                    {copiedEditedName ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4 text-[#C9A24B]" />
                    )}
                    <span>{copiedEditedName ? 'تم نسخ الاسم' : 'نسخ الاسم فقط'}</span>
                  </button>
                  <a
                    href={GMAIL_MAPS_SEARCH_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-h-[38px] px-3 rounded-xl bg-white border border-[#D8D4C8] text-xs font-bold text-[#1A2421] flex items-center justify-center gap-1.5 hover:bg-[#FAF8F4]"
                  >
                    <Mail className="w-4 h-4 text-[#EA4335]" />
                    <span>ردود جوجل في Gmail</span>
                  </a>
                </div>
                <p className="text-[11px] text-[#5A6561] leading-relaxed flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 text-[#C9A24B] shrink-0 mt-0.5" />
                  <span>
                    الاسم نُسخ تلقائياً؛ عند فتح بطاقة المسجد في جوجل اضغط «اقتراح تعديل» ← «لصق» ← «إرسال». (ملاحظة: جوجل لا تقبل التعديلات عبر إرسال بريد Gmail، بل عبر الخريطة مباشرة وترد عليك في Gmail).
                  </span>
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full h-12 rounded-xl bg-[#0F4C3A] text-white font-bold text-sm hover:bg-[#0B3A2C]"
              >
                إغلاق والعودة للخريطة
              </button>
            </div>
          ) : activeTab === 'details' ? (
            <>
              {missingName && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                  <span>
                    الاسم في خرائط جوجل ناقص أو غير محدد؛ اكتب الاسم الصحيح في المربع أدناه ثم احفظه أو افتح خرائط جوجل.
                  </span>
                </div>
              )}

              {/* 1-Tap Quick Edit & Direct Send to Awqaf + Google Maps */}
              <div className="p-3.5 rounded-2xl bg-[#0F4C3A]/5 border border-[#0F4C3A]/20 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="g-quick-name"
                    className="text-xs font-bold text-[#0F4C3A]"
                  >
                    تعديل وتوثيق سريع (بضغطة واحدة)
                  </label>
                  {resolvedLocality && (
                    <span className="text-[11px] font-semibold text-[#4A5552]">
                      المحلة: {resolvedLocality}
                    </span>
                  )}
                </div>

                <input
                  id="g-quick-name"
                  type="text"
                  maxLength={150}
                  value={officialName}
                  onChange={(e) => setOfficialName(e.target.value)}
                  placeholder="اكتب الاسم الصحيح للمسجد..."
                  className="w-full h-11 px-3 rounded-xl border border-[#D8D4C8] bg-white text-base sm:text-sm font-semibold focus:outline-none focus:border-[#0F4C3A]"
                />

                {errorMsg && (
                  <p className="text-xs text-red-700 font-medium">{errorMsg}</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleQuickSaveOrOpenForm()}
                    className="min-h-[44px] px-3 rounded-xl bg-[#0F4C3A] text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-[#0B3A2C] active:scale-[0.98] disabled:opacity-60 transition"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#C9A24B]" />
                    <span>
                      {submitting
                        ? 'جاري التوثيق...'
                        : 'حفظ وتوثيق في المنظومة مباشرة'}
                    </span>
                  </button>

                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => void handleCopyNameText(officialName)}
                    className="min-h-[44px] px-3 rounded-xl bg-white border border-[#D8D4C8] text-[#B91C1C] font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-red-50/40 transition"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>
                      {copiedEditedName
                        ? 'تم النسخ وفتح جوجل'
                        : 'نسخ الاسم وفتح جوجل طوالي'}
                    </span>
                  </a>
                </div>

                <p className="text-[11px] text-[#5A6561] leading-relaxed">
                  عند الضغط على «نسخ الاسم وفتح جوجل طوالي» يُنسخ الاسم تلقائياً وتُفتح بطاقة المسجد مباشرة لتضغط «اقتراح تعديل» ← «لصق» ← «إرسال».
                </p>
              </div>

              {/* ALL Google Maps Photos + Rich Details */}
              <GooglePlaceDetailsBlock
                placeId={candidate.placeId}
                fallbackCandidate={candidate}
              />

              {/* Secondary Full Form / Pin Move / Gmail check */}
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('edit')}
                    className="min-h-[44px] px-3 rounded-xl bg-[#FAF8F4] border border-[#D8D4C8] text-[#0F4C3A] font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-white transition"
                  >
                    <Pencil className="w-4 h-4 text-[#C9A24B]" />
                    <span>نموذج التعديل الكامل والصور</span>
                  </button>

                  {onMovePinAndOpenForm && (
                    <button
                      type="button"
                      onClick={() => onMovePinAndOpenForm(candidate, officialName.trim())}
                      className="min-h-[44px] px-3 rounded-xl bg-[#C9A24B]/18 border border-[#C9A24B]/60 text-[#1A2421] font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-[#C9A24B]/28 transition"
                    >
                      <Move className="w-4 h-4 text-[#0F4C3A]" />
                      <span>تصحيح الموقع على الخريطة</span>
                    </button>
                  )}
                </div>

                <a
                  href={GMAIL_MAPS_SEARCH_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[38px] px-3 rounded-xl bg-white border border-[#E5E2D9] text-[#4A5552] font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-[#FAF8F4] transition"
                >
                  <Mail className="w-3.5 h-3.5 text-[#EA4335]" />
                  <span>متابعة ردود قبول التعديلات في Gmail</span>
                </a>
              </div>
            </>
          ) : (
            /* In-App Direct Edit Form matching Google's "تعديل المعلومات" */
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">
                  {errorMsg}
                </div>
              )}

              {duplicateAlert && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="text-xs text-[#1A2421]">
                      <p className="font-bold">تنبيه: يوجد مسجد مشابه أو قريب</p>
                      <p className="mt-1 text-[#4A5552]">
                        المسجد المسجّل:{' '}
                        <strong className="text-[#0F4C3A]">
                          {duplicateAlert.mosque.officialName}
                        </strong>{' '}
                        · {duplicateAlert.mosque.locality} ·{' '}
                        <span className="tabular-nums">
                          على بُعد {duplicateAlert.distanceMeters} م
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    {onSwitchToEditExisting && (
                      <button
                        type="button"
                        onClick={handleEditDuplicate}
                        className="flex-1 min-h-[40px] px-3 rounded-xl bg-white border border-amber-400 text-[#1A2421] font-semibold text-xs hover:bg-amber-100/60"
                      >
                        هو نفسه – تعديله
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        setDuplicateAlert(null);
                        void performSave();
                      }}
                      className="flex-1 min-h-[40px] px-3 rounded-xl bg-[#0F4C3A] text-white font-semibold text-xs hover:bg-[#0B3A2C]"
                    >
                      مسجد مختلف – حفظ
                    </button>
                  </div>
                </div>
              )}

              {/* Arabic Place Name (like Google screenshot) */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="g-edit-official-name"
                    className="text-xs font-bold text-[#1A2421]"
                  >
                    اسم المكان باللغة العربية (مطلوب) <span className="text-red-600">*</span>
                  </label>
                  {candidate.displayName && officialName !== candidate.displayName && (
                    <button
                      type="button"
                      onClick={() => setOfficialName(candidate.displayName)}
                      className="text-[11px] font-semibold text-[#0F4C3A] hover:underline"
                    >
                      استعادة اسم جوجل
                    </button>
                  )}
                </div>
                <input
                  id="g-edit-official-name"
                  type="text"
                  required
                  maxLength={150}
                  value={officialName}
                  onChange={(e) => setOfficialName(e.target.value)}
                  placeholder="مثال: جامع الفتح (جامع السوق)"
                  className="w-full h-11 px-3.5 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-base sm:text-sm focus:outline-none focus:border-[#0F4C3A] focus:bg-white transition"
                />
              </div>

              {/* Common Name */}
              <div>
                <label
                  htmlFor="g-edit-common-name"
                  className="block text-xs font-semibold text-[#1A2421] mb-1.5"
                >
                  الاسم المتداول <span className="font-normal text-[#5A6561]">(اختياري)</span>
                </label>
                <input
                  id="g-edit-common-name"
                  type="text"
                  maxLength={150}
                  value={commonName}
                  onChange={(e) => setCommonName(e.target.value)}
                  placeholder="الاسم المعروف بين الأهالي"
                  className="w-full h-11 px-3.5 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-base sm:text-sm focus:outline-none focus:border-[#0F4C3A] focus:bg-white transition"
                />
              </div>

              {/* Locality */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="g-edit-locality" className="text-xs font-bold text-[#1A2421]">
                    المحلة / المنطقة <span className="text-red-600">*</span>
                  </label>
                  {knownLocalities.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsCustomLocality((prev) => !prev)}
                      className="text-[11px] font-semibold text-[#0F4C3A] hover:underline"
                    >
                      {isCustomLocality ? 'اختر من القائمة السابقة' : '+ محلة جديدة'}
                    </button>
                  )}
                </div>

                {isCustomLocality || knownLocalities.length === 0 ? (
                  <input
                    id="g-edit-locality"
                    type="text"
                    required
                    maxLength={100}
                    value={customLocality}
                    onChange={(e) => setCustomLocality(e.target.value)}
                    placeholder="أدخل اسم المحلة أو المنطقة"
                    className="w-full h-11 px-3.5 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-base sm:text-sm focus:outline-none focus:border-[#0F4C3A] focus:bg-white transition"
                  />
                ) : (
                  <select
                    id="g-edit-locality"
                    required
                    value={locality}
                    onChange={(e) => setLocality(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-base sm:text-sm focus:outline-none focus:border-[#0F4C3A] focus:bg-white transition"
                  >
                    <option value="" disabled>
                      اختر المحلة / المنطقة
                    </option>
                    {knownLocalities.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Location Coordinate + Optional Pin Move */}
              <div className="p-3 rounded-xl bg-[#FAF8F4] border border-[#E5E2D9] flex items-center justify-between gap-2 text-xs">
                <div>
                  <span className="block font-bold text-[#1A2421]">الموقع الجغرافي</span>
                  <span dir="ltr" className="font-mono text-[#4A5552] tabular-nums">
                    {candidate.lat.toFixed(6)}, {candidate.lng.toFixed(6)}
                  </span>
                </div>
                {onMovePinAndOpenForm && (
                  <button
                    type="button"
                    onClick={() => onMovePinAndOpenForm(candidate, officialName.trim())}
                    className="min-h-[38px] px-3 rounded-lg bg-white border border-[#D8D4C8] text-[#0F4C3A] font-bold flex items-center gap-1 hover:bg-[#FAF8F4]"
                  >
                    <Move className="w-3.5 h-3.5 text-[#C9A24B]" />
                    <span>تعديل الدبوس</span>
                  </button>
                )}
              </div>

              {/* Landmark + Notes + Quick Status Chips */}
              <div>
                <label
                  htmlFor="g-edit-landmark"
                  className="block text-xs font-semibold text-[#1A2421] mb-1.5"
                >
                  علامة دالة <span className="font-normal text-[#5A6561]">(اختياري)</span>
                </label>
                <input
                  id="g-edit-landmark"
                  type="text"
                  maxLength={200}
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="أقرب معلم واضح (مدرسة، مصرف، مفترق...)"
                  className="w-full h-11 px-3.5 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-base sm:text-sm focus:outline-none focus:border-[#0F4C3A] focus:bg-white transition"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="g-edit-notes"
                  className="block text-xs font-semibold text-[#1A2421]"
                >
                  الحالة والملاحظات <span className="font-normal text-[#5A6561]">(اختياري)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_STATUS_NOTES.map((chip) => {
                    const active = notes.includes(chip);
                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => toggleQuickNote(chip)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition ${
                          active
                            ? 'bg-[#0F4C3A] text-white border-[#0F4C3A]'
                            : 'bg-[#FAF8F4] text-[#4A5552] border-[#D8D4C8] hover:border-[#0F4C3A]'
                        }`}
                      >
                        {chip}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  id="g-edit-notes"
                  rows={2}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="أدخل أي تفاصيل إضافية أو تصحيحات..."
                  className="w-full p-3 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-base sm:text-sm focus:outline-none focus:border-[#0F4C3A] focus:bg-white transition resize-none"
                />
              </div>

              {/* Add Field Photos to Awqaf Record */}
              <div>
                <p className="text-xs font-semibold text-[#1A2421] mb-1.5">
                  إضافة صور للمنظومة ({photos.length}/3)
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={photos.length >= 3 || compressingPhoto}
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex-1 min-h-[44px] px-3 rounded-xl bg-[#C9A24B]/20 border border-[#C9A24B]/50 text-[#1A2421] font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-[#C9A24B]/30 disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4 text-[#0F4C3A]" />
                    <span>{compressingPhoto ? 'جاري الضغط...' : 'التقاط صورة'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={photos.length >= 3 || compressingPhoto}
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex-1 min-h-[44px] px-3 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-[#0F4C3A] font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-white disabled:opacity-50"
                  >
                    <ImagePlus className="w-4 h-4" />
                    <span>من المعرض</span>
                  </button>
                </div>

                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => void handlePhotoFiles(e.target.files)}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => void handlePhotoFiles(e.target.files)}
                />

                {photos.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {photos.map((photo, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-square rounded-xl overflow-hidden border border-[#E5E2D9]"
                      >
                        <img
                          src={photo}
                          alt={`صورة ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label="حذف الصورة"
                          className="absolute top-1 left-1 w-7 h-7 rounded-lg bg-black/65 text-white flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || compressingPhoto}
                className="w-full h-12 rounded-xl bg-[#0F4C3A] text-white font-bold text-sm hover:bg-[#0B3A2C] active:scale-[0.98] disabled:opacity-60 transition"
              >
                {submitting
                  ? 'جاري الحفظ في المنظومة...'
                  : 'حفظ التعديلات وتوثيق المسجد في المنظومة'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
