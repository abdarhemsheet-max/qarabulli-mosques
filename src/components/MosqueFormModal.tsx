import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  ImagePlus,
  Plus,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import type { MosqueFormValues, MosqueRecord, UserProfile } from '../types/mosque';
import {
  formatEnglishDateTime,
  generateGoogleMapsUrl,
  haversineDistanceMeters,
  normalizeArabicName,
} from '../lib/utils/geo';
import { compressImageToBase64 } from '../lib/utils/image';
import { createMosque, updateMosque } from '../lib/firebase/mosques';

interface MosqueFormModalProps {
  open: boolean;
  editingMosque: MosqueRecord | null;
  initialLat: number;
  initialLng: number;
  initialAccuracy: number;
  prefillName?: string;
  prefillOsmId?: string;
  prefillGooglePlaceId?: string;
  existingMosques: MosqueRecord[];
  currentUser: UserProfile;
  onClose: () => void;
  onSwitchToEditExisting: (mosque: MosqueRecord) => void;
  onSuccessAddAnother: () => void;
}

interface DuplicateCandidate {
  mosque: MosqueRecord;
  reason: 'name' | 'distance';
  distanceMeters: number;
}

interface SavedSummary {
  officialName: string;
  locality: string;
  landmark: string;
  lat: number;
  lng: number;
  mapsUrl: string;
  pendingSync: boolean;
}

export function MosqueFormModal({
  open,
  editingMosque,
  initialLat,
  initialLng,
  initialAccuracy,
  prefillName = '',
  prefillOsmId = '',
  prefillGooglePlaceId = '',
  existingMosques,
  currentUser,
  onClose,
  onSwitchToEditExisting,
  onSuccessAddAnother,
}: MosqueFormModalProps) {
  const [officialName, setOfficialName] = useState('');
  const [commonName, setCommonName] = useState('');
  const [locality, setLocality] = useState('');
  const [isCustomLocality, setIsCustomLocality] = useState(false);
  const [customLocality, setCustomLocality] = useState('');
  const [landmark, setLandmark] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [osmId, setOsmId] = useState('');
  const [googlePlaceId, setGooglePlaceId] = useState('');

  const [compressingPhoto, setCompressingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [sharedOk, setSharedOk] = useState(false);
  const [duplicateAlert, setDuplicateAlert] = useState<DuplicateCandidate | null>(null);
  const [savedState, setSavedState] = useState<SavedSummary | null>(null);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const activeLat = editingMosque ? editingMosque.lat : initialLat;
  const activeLng = editingMosque ? editingMosque.lng : initialLng;
  const activeAccuracy = editingMosque ? editingMosque.accuracy : initialAccuracy;
  const mapsUrl = generateGoogleMapsUrl(activeLat, activeLng);

  const knownLocalities = useMemo(() => {
    const set = new Set<string>();
    existingMosques.forEach((m) => {
      if (m.locality.trim()) set.add(m.locality.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [existingMosques]);

  useEffect(() => {
    if (!open) return;

    setErrorMsg('');
    setDuplicateAlert(null);
    setSavedState(null);
    setCopiedLink(false);
    setSharedOk(false);

    if (editingMosque) {
      setOfficialName(editingMosque.officialName);
      setCommonName(editingMosque.commonName);
      setLocality(editingMosque.locality);
      setIsCustomLocality(false);
      setCustomLocality('');
      setLandmark(editingMosque.landmark);
      setNotes(editingMosque.notes);
      setPhotos(editingMosque.photos ?? []);
      setOsmId(editingMosque.osmId ?? '');
      setGooglePlaceId(editingMosque.googlePlaceId ?? '');
    } else {
      let storedLoc = '';
      try {
        storedLoc = (window.localStorage.getItem('qarabulli_last_locality') ?? '').trim();
      } catch {
        storedLoc = '';
      }
      const preferredLoc =
        storedLoc && knownLocalities.includes(storedLoc)
          ? storedLoc
          : knownLocalities[0] ?? '';

      setOfficialName(prefillName.trim());
      setCommonName('');
      setLocality(preferredLoc);
      setIsCustomLocality(knownLocalities.length === 0);
      setCustomLocality(knownLocalities.length === 0 ? storedLoc : '');
      setLandmark('');
      setNotes('');
      setPhotos([]);
      setOsmId(prefillOsmId.trim());
      setGooglePlaceId(prefillGooglePlaceId.trim());
    }
  }, [open, editingMosque?.id, prefillName, prefillOsmId, prefillGooglePlaceId]);

  if (!open) return null;

  const resolvedLocality = (isCustomLocality ? customLocality : locality).trim();

  const handlePhotoFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMsg('');

    const remainingSlots = 3 - photos.length;
    if (remainingSlots <= 0) {
      setErrorMsg('الحد الأقصى للصور هو 3 صور للعلامة الدالة.');
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

  const handleCopyMapsLink = async () => {
    try {
      await navigator.clipboard.writeText(mapsUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setErrorMsg('تعذّر نسخ الرابط تلقائياً.');
    }
  };

  const handleShareSavedLocation = async () => {
    if (!savedState) return;
    const shareText = [
      `توثيق مسجد: ${savedState.officialName}`,
      `المحلة / المنطقة: ${savedState.locality}`,
      savedState.landmark ? `علامة دالة: ${savedState.landmark}` : '',
      `الموقع على خرائط جوجل: ${savedState.mapsUrl}`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      if (navigator.share) {
        await navigator.share({
          title: savedState.officialName,
          text: shareText,
          url: savedState.mapsUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareText);
      }
      setSharedOk(true);
      window.setTimeout(() => setSharedOk(false), 2500);
    } catch {
      // User dismissed share sheet
    }
  };

  const findDuplicateCandidate = (): DuplicateCandidate | null => {
    const targetName = normalizeArabicName(officialName);
    let closestMatch: DuplicateCandidate | null = null;

    for (const m of existingMosques) {
      if (editingMosque && m.id === editingMosque.id) continue;

      const dist = haversineDistanceMeters(activeLat, activeLng, m.lat, m.lng);
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
      lat: activeLat,
      lng: activeLng,
      accuracy: activeAccuracy,
      photos,
      osmId,
      googlePlaceId,
    };

    try {
      try {
        if (payload.locality) {
          window.localStorage.setItem('qarabulli_last_locality', payload.locality);
        }
      } catch {
        // ignore
      }
      if (editingMosque) {
        const res = await updateMosque(editingMosque.id, payload, currentUser);
        setSavedState({
          officialName: payload.officialName,
          locality: payload.locality,
          landmark: payload.landmark,
          lat: payload.lat,
          lng: payload.lng,
          mapsUrl,
          pendingSync: res.pendingSync,
        });
      } else {
        const res = await createMosque(payload, currentUser);
        setSavedState({
          officialName: payload.officialName,
          locality: payload.locality,
          landmark: payload.landmark,
          lat: payload.lat,
          lng: payload.lng,
          mapsUrl,
          pendingSync: res.pendingSync,
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذّر حفظ بيانات المسجد.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!officialName.trim()) {
      setErrorMsg('يرجى إدخال الاسم الرسمي للمسجد.');
      return;
    }
    if (!resolvedLocality) {
      setErrorMsg('يرجى اختيار المحلة / المنطقة أو كتابة محلة جديدة.');
      return;
    }

    if (!editingMosque) {
      const candidate = findDuplicateCandidate();
      if (candidate) {
        setDuplicateAlert(candidate);
        return;
      }
    }

    await performSave();
  };

  const handleEditDuplicate = () => {
    if (!duplicateAlert) return;
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
    onSwitchToEditExisting({
      ...target,
      osmId: target.osmId || osmId || prefillOsmId.trim(),
      googlePlaceId: target.googlePlaceId || googlePlaceId || prefillGooglePlaceId.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-2xl border border-[#E5E2D9] shadow-2xl max-h-[94dvh] sm:max-h-[90vh] flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]">
        {/* Mobile grab handle */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-[#D8D4C8]" />
        </div>

        {/* Header */}
        <div className="px-5 py-3 border-b border-[#EFECE4] flex items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg font-bold text-[#0F4C3A]">
            {savedState
              ? 'تم توثيق المسجد بنجاح'
              : editingMosque
                ? 'تعديل بيانات المسجد'
                : 'توثيق بيانات المسجد'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="min-h-[44px] min-w-[44px] rounded-xl text-[#5A6561] hover:bg-[#FAF8F4] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success View with direct Google Maps Link & Share */}
        {savedState ? (
          <div className="p-5 sm:p-6 text-center space-y-4 overflow-y-auto">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#0F4C3A]/10 text-[#0F4C3A] flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#1A2421]">{savedState.officialName}</h3>
              <p className="text-xs text-[#5A6561] mt-1 tabular-nums">
                {savedState.locality} ·{' '}
                <span dir="ltr">
                  {savedState.lat.toFixed(6)}, {savedState.lng.toFixed(6)}
                </span>
              </p>
              <p className="text-sm text-[#4A5552] mt-2">
                {savedState.pendingSync
                  ? 'تم الحفظ محلياً وظهرت بيانات المسجد وصوره في خريطة المنظومة، وسيُرفع تلقائياً عند عودة الاتصال.'
                  : 'تم حفظ المسجد وظهرت كامل بياناته وصوره فوراً في خريطة المنظومة، وتُدرج في ملف Excel.'}
              </p>
            </div>

            {/* Direct Google Maps & Share actions */}
            <div className="p-3.5 rounded-2xl bg-[#FAF8F4] border border-[#E5E2D9] space-y-2.5 text-right">
              <p className="text-xs font-bold text-[#0F4C3A]">
                رابط خرائط جوجل (للعرض العام وإضافة المكان في خرائط جوجل)
              </p>
              <p
                dir="ltr"
                className="text-xs text-[#4A5552] font-mono truncate select-all bg-white px-3 py-2 rounded-xl border border-[#EFECE4]"
              >
                {savedState.mapsUrl}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <a
                  href={savedState.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-12 px-4 rounded-xl bg-[#0F4C3A] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#0B3A2C] active:scale-[0.98] transition"
                >
                  <ExternalLink className="w-4 h-4 text-[#C9A24B]" />
                  <span>فتح في خرائط جوجل</span>
                </a>
                <button
                  type="button"
                  onClick={() => void handleShareSavedLocation()}
                  className="h-12 px-4 rounded-xl bg-white border border-[#D8D4C8] text-[#0F4C3A] font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#FAF8F4] active:scale-[0.98] transition"
                >
                  {sharedOk ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4 text-[#C9A24B]" />}
                  <span>{sharedOk ? 'تم نسخ بيانات الموقع' : 'إرسال / مشاركة الموقع'}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              {!editingMosque && (
                <button
                  type="button"
                  onClick={() => {
                    setSavedState(null);
                    onSuccessAddAnother();
                  }}
                  className="flex-1 h-12 rounded-xl bg-[#C9A24B]/20 border border-[#C9A24B]/60 text-[#1A2421] font-bold text-sm hover:bg-[#C9A24B]/30 transition flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4 text-[#0F4C3A]" />
                  <span>إضافة مسجد آخر</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-12 rounded-xl border border-[#D8D4C8] text-[#1A2421] font-semibold text-sm hover:bg-[#FAF8F4] transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
                {errorMsg}
              </div>
            )}

            {/* Duplicate Detection Alert */}
            {duplicateAlert && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="text-sm text-[#1A2421]">
                    <p className="font-bold">تنبيه: يوجد مسجد مشابه أو قريب</p>
                    <p className="mt-1 text-[#4A5552]">
                      المسجد المسجّل: <strong className="text-[#0F4C3A]">{duplicateAlert.mosque.officialName}</strong>
                      {' · '}
                      {duplicateAlert.mosque.locality}
                      {' · '}
                      <span className="tabular-nums">على بُعد {duplicateAlert.distanceMeters} م</span>
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={handleEditDuplicate}
                    className="flex-1 min-h-[46px] px-3 rounded-xl bg-white border border-amber-400 text-[#1A2421] font-semibold text-sm hover:bg-amber-100/60 transition"
                  >
                    هو نفسه – تعديله
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDuplicateAlert(null);
                      void performSave();
                    }}
                    disabled={submitting}
                    className="flex-1 min-h-[46px] px-3 rounded-xl bg-[#0F4C3A] text-white font-semibold text-sm hover:bg-[#0B3A2C] transition"
                  >
                    مسجد مختلف – حفظ
                  </button>
                </div>
              </div>
            )}

            {/* Official Name */}
            <div>
              <label htmlFor="mosque-official-name" className="block text-sm font-bold text-[#1A2421] mb-1.5">
                الاسم الرسمي للمسجد <span className="text-red-600">*</span>
              </label>
              <input
                id="mosque-official-name"
                type="text"
                required
                maxLength={150}
                value={officialName}
                onChange={(e) => setOfficialName(e.target.value)}
                placeholder="مثال: مسجد عمر بن الخطاب"
                className="w-full h-12 px-3.5 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-base sm:text-sm focus:outline-none focus:border-[#0F4C3A] focus:bg-white transition"
              />
            </div>

            {/* Common Name */}
            <div>
              <label htmlFor="mosque-common-name" className="block text-sm font-semibold text-[#1A2421] mb-1.5">
                الاسم المتداول <span className="text-xs font-normal text-[#5A6561]">(اختياري)</span>
              </label>
              <input
                id="mosque-common-name"
                type="text"
                maxLength={150}
                value={commonName}
                onChange={(e) => setCommonName(e.target.value)}
                placeholder="الاسم المعروف بين الأهالي إن اختلف"
                className="w-full h-12 px-3.5 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-base sm:text-sm focus:outline-none focus:border-[#0F4C3A] focus:bg-white transition"
              />
            </div>

            {/* Locality */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="mosque-locality" className="text-sm font-bold text-[#1A2421]">
                  المحلة / المنطقة <span className="text-red-600">*</span>
                </label>
                {knownLocalities.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsCustomLocality((prev) => !prev)}
                    className="min-h-[32px] px-2 text-xs font-semibold text-[#0F4C3A] hover:underline"
                  >
                    {isCustomLocality ? 'اختر من القائمة السابقة' : '+ كتابة محلة جديدة'}
                  </button>
                )}
              </div>

              {isCustomLocality || knownLocalities.length === 0 ? (
                <input
                  id="mosque-locality"
                  type="text"
                  required
                  maxLength={100}
                  value={customLocality}
                  onChange={(e) => setCustomLocality(e.target.value)}
                  placeholder="أدخل اسم المحلة أو المنطقة"
                  className="w-full h-12 px-3.5 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-base sm:text-sm focus:outline-none focus:border-[#0F4C3A] focus:bg-white transition"
                />
              ) : (
                <select
                  id="mosque-locality"
                  required
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                  className="w-full h-12 px-3.5 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-base sm:text-sm focus:outline-none focus:border-[#0F4C3A] focus:bg-white transition"
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

            {/* Landmark + Camera/Photo */}
            <div>
              <label htmlFor="mosque-landmark" className="block text-sm font-semibold text-[#1A2421] mb-1.5">
                علامة دالة <span className="text-xs font-normal text-[#5A6561]">(اختياري)</span>
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="mosque-landmark"
                  type="text"
                  maxLength={200}
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="أقرب معلم واضح (مدرسة، مصرف، محطة وقود...)"
                  className="flex-1 h-12 px-3.5 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-base sm:text-sm focus:outline-none focus:border-[#0F4C3A] focus:bg-white transition"
                />
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={photos.length >= 3 || compressingPhoto}
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex-1 sm:flex-none min-h-[48px] px-4 rounded-xl bg-[#C9A24B]/20 border border-[#C9A24B]/50 text-[#1A2421] font-semibold text-sm flex items-center justify-center gap-1.5 hover:bg-[#C9A24B]/30 disabled:opacity-50 transition whitespace-nowrap"
                  >
                    <Camera className="w-4 h-4 text-[#0F4C3A]" />
                    <span>{compressingPhoto ? 'جاري الضغط...' : 'إضافة صورة'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={photos.length >= 3 || compressingPhoto}
                    onClick={() => galleryInputRef.current?.click()}
                    title="اختيار من المعرض"
                    aria-label="اختيار من المعرض"
                    className="min-h-[48px] min-w-[48px] px-3 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-[#0F4C3A] flex items-center justify-center hover:bg-white disabled:opacity-50 transition"
                  >
                    <ImagePlus className="w-5 h-5" />
                  </button>
                </div>
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
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  {photos.map((photo, idx) => (
                    <div
                      key={idx}
                      className="relative aspect-square rounded-xl overflow-hidden border border-[#E5E2D9] bg-[#FAF8F4]"
                    >
                      <img
                        src={photo}
                        alt={`صورة العلامة الدالة ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="حذف الصورة"
                        className="absolute top-1 left-1 w-8 h-8 rounded-lg bg-black/65 text-white flex items-center justify-center hover:bg-red-700 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-[#5A6561] mt-1 tabular-nums">
                يمكن إرفاق حتى 3 صور ({photos.length}/3) — تُضغط تلقائياً قبل الحفظ.
              </p>
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="mosque-notes" className="block text-sm font-semibold text-[#1A2421] mb-1.5">
                ملاحظات <span className="text-xs font-normal text-[#5A6561]">(اختياري)</span>
              </label>
              <textarea
                id="mosque-notes"
                rows={2}
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: مسجد جامع، مغلق للصيانة، قيد الإنشاء..."
                className="w-full p-3 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-base sm:text-sm focus:outline-none focus:border-[#0F4C3A] focus:bg-white transition resize-none"
              />
            </div>

            {/* Auto-generated Google Maps URL */}
            <div className="p-3 rounded-xl bg-[#FAF8F4] border border-[#E5E2D9] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#0F4C3A]">رابط الموقع (خرائط جوجل)</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyMapsLink}
                    className="min-h-[38px] px-3 rounded-lg bg-white border border-[#D8D4C8] text-xs font-semibold text-[#1A2421] flex items-center gap-1 hover:bg-[#FAF8F4]"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-[#0F4C3A]" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'تم النسخ' : 'نسخ'}</span>
                  </button>
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[38px] px-3 rounded-lg bg-white border border-[#D8D4C8] text-xs font-semibold text-[#0F4C3A] flex items-center gap-1 hover:bg-[#FAF8F4]"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>فتح</span>
                  </a>
                </div>
              </div>
              <p
                dir="ltr"
                className="text-xs text-[#4A5552] font-mono truncate select-all bg-white px-2.5 py-1.5 rounded-lg border border-[#EFECE4]"
              >
                {mapsUrl}
              </p>
            </div>

            {/* Auto-recorded Metadata Summary */}
            <div className="text-xs text-[#5A6561] flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums pt-1">
              <span>خط العرض: {activeLat.toFixed(6)}</span>
              <span aria-hidden="true">·</span>
              <span>خط الطول: {activeLng.toFixed(6)}</span>
              <span aria-hidden="true">·</span>
              <span>الدقة: {activeAccuracy} م</span>
              <span aria-hidden="true">·</span>
              <span>الموثِّق: {editingMosque ? editingMosque.createdByName : currentUser.name}</span>
              <span aria-hidden="true">·</span>
              <span>{formatEnglishDateTime(editingMosque ? editingMosque.createdAt : new Date())}</span>
              {osmId && (
                <>
                  <span aria-hidden="true">·</span>
                  <span dir="ltr">OSM: {osmId.replace('_', '/')}</span>
                </>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-2 sticky bottom-0 bg-white pb-1">
              <button
                type="submit"
                disabled={submitting || compressingPhoto}
                className="w-full h-13 rounded-xl bg-[#0F4C3A] text-white font-bold text-base hover:bg-[#0B3A2C] active:scale-[0.99] disabled:opacity-60 transition"
              >
                {submitting ? 'جاري الحفظ...' : editingMosque ? 'حفظ التعديلات' : 'حفظ'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
