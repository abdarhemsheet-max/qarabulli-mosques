import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ImagePlus,
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react';
import type { LatLng, MosqueFormValues, MosqueRecord, OsmSettings, UserProfile } from '../types/mosque';
import { haversineDistanceMeters, normalizeArabicName } from '../lib/utils/geo';
import { compressImageToBase64 } from '../lib/utils/image';
import { createMosque, updateMosque } from '../lib/supabase/mosques';
import { BottomSheet } from './ui/BottomSheet';
import { OsmPublishCard } from './OsmPublishCard';

const LAST_LOCALITY_KEY = 'qarabulli_last_locality';
const MAX_PHOTOS = 3;

interface MosqueFormSheetProps {
  open: boolean;
  position: (LatLng & { accuracy: number }) | null;
  editing: MosqueRecord | null;
  prefillName?: string;
  prefillOsmId?: string;
  existingMosques: MosqueRecord[];
  currentUser: UserProfile;
  osmSettings: OsmSettings;
  onClose: () => void;
  onChangeLocation: () => void;
  onEditExisting: (mosque: MosqueRecord) => void;
  onAddAnother: () => void;
}

interface Duplicate {
  mosque: MosqueRecord;
  distance: number;
  byName: boolean;
}

function readLastLocality(): string {
  try {
    return (localStorage.getItem(LAST_LOCALITY_KEY) ?? '').trim();
  } catch {
    return '';
  }
}

export function MosqueFormSheet({
  open,
  position,
  editing,
  prefillName = '',
  prefillOsmId = '',
  existingMosques,
  currentUser,
  osmSettings,
  onClose,
  onChangeLocation,
  onEditExisting,
  onAddAnother,
}: MosqueFormSheetProps) {
  const [officialName, setOfficialName] = useState('');
  const [locality, setLocality] = useState('');
  const [customLocality, setCustomLocality] = useState(false);
  const [commonName, setCommonName] = useState('');
  const [landmark, setLandmark] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);

  // Localities ordered by how often they are used
  const localities = useMemo(() => {
    const counts = new Map<string, number>();
    existingMosques.forEach((m) => {
      const l = m.locality.trim();
      if (l) counts.set(l, (counts.get(l) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
  }, [existingMosques]);

  useEffect(() => {
    if (!open) return;
    setErrorMsg('');
    setDuplicate(null);
    setSavedId(null);
    if (editing) {
      setOfficialName(editing.officialName);
      setLocality(editing.locality);
      setCustomLocality(!localities.includes(editing.locality));
      setCommonName(editing.commonName);
      setLandmark(editing.landmark);
      setNotes(editing.notes);
      setPhotos(editing.photos ?? []);
      setShowMore(Boolean(editing.commonName || editing.landmark || editing.notes));
    } else {
      const last = readLastLocality();
      setOfficialName(prefillName.trim());
      setLocality(last);
      setCustomLocality(Boolean(last) && !localities.includes(last) ? true : localities.length === 0);
      setCommonName('');
      setLandmark('');
      setNotes('');
      setPhotos([]);
      setShowMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id, prefillName]);

  const lat = position?.lat ?? editing?.lat ?? 0;
  const lng = position?.lng ?? editing?.lng ?? 0;
  const accuracy = position?.accuracy ?? editing?.accuracy ?? 0;

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const slots = MAX_PHOTOS - photos.length;
    if (slots <= 0) return;
    setErrorMsg('');
    setCompressing(true);
    try {
      const out: string[] = [];
      for (const f of Array.from(files).slice(0, slots)) out.push(await compressImageToBase64(f));
      setPhotos((p) => [...p, ...out].slice(0, MAX_PHOTOS));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذّر تجهيز الصورة.');
    } finally {
      setCompressing(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (galleryRef.current) galleryRef.current.value = '';
    }
  };

  const findDuplicate = (): Duplicate | null => {
    const name = normalizeArabicName(officialName);
    let near: Duplicate | null = null;
    for (const m of existingMosques) {
      if (editing && m.id === editing.id) continue;
      const d = haversineDistanceMeters(lat, lng, m.lat, m.lng);
      const same =
        name &&
        (normalizeArabicName(m.officialName) === name ||
          (m.commonName && normalizeArabicName(m.commonName) === name));
      if (same) return { mosque: m, distance: Math.round(d), byName: true };
      if (d < 30 && (!near || d < near.distance)) near = { mosque: m, distance: Math.round(d), byName: false };
    }
    return near;
  };

  const save = async () => {
    setErrorMsg('');
    setSaving(true);
    const payload: MosqueFormValues = {
      officialName: officialName.trim(),
      commonName: commonName.trim(),
      locality: locality.trim(),
      landmark: landmark.trim(),
      notes: notes.trim(),
      lat,
      lng,
      accuracy,
      photos,
      osmId: editing?.osmId || prefillOsmId,
      googlePlaceId: editing?.googlePlaceId ?? '',
    };
    try {
      try {
        localStorage.setItem(LAST_LOCALITY_KEY, payload.locality);
      } catch {
        // ignore
      }
      if (editing) {
        await updateMosque(editing.id, payload, currentUser);
        setSavedId(editing.id);
      } else {
        const res = await createMosque(payload, currentUser);
        setSavedId(res.id);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذّر الحفظ.');
    } finally {
      setSaving(false);
    }
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!officialName.trim()) return setErrorMsg('اكتب اسم المسجد.');
    if (!locality.trim()) return setErrorMsg('اختر المحلة أو اكتبها.');
    if (!editing) {
      const dup = findDuplicate();
      if (dup) {
        setDuplicate(dup);
        return;
      }
    }
    await save();
  };

  const savedRecord = savedId ? existingMosques.find((m) => m.id === savedId) ?? null : null;

  // ------------------------------------------------------------------ success
  if (open && savedId) {
    return (
      <BottomSheet
        open
        onClose={onClose}
        tall
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} className="btn-outline h-12">
              إغلاق
            </button>
            {!editing ? (
              <button type="button" onClick={onAddAnother} className="btn-primary h-12">
                <Plus className="w-5 h-5 text-gold" />
                مسجد آخر
              </button>
            ) : (
              <span />
            )}
          </div>
        }
      >
        <div className="p-5 space-y-5">
          <div className="text-center space-y-2 pt-2">
            <div className="w-16 h-16 mx-auto rounded-full bg-brand-soft text-brand flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h2 className="text-xl font-extrabold text-ink">{editing ? 'تم حفظ التعديل' : 'تم توثيق المسجد'}</h2>
            <p className="text-sm text-muted">
              {officialName} · {locality}
            </p>
          </div>
          <OsmPublishCard mosque={savedRecord} currentUser={currentUser} osmSettings={osmSettings} />
        </div>
      </BottomSheet>
    );
  }

  // --------------------------------------------------------------------- form
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      locked={saving}
      tall
      title={editing ? 'تعديل بيانات المسجد' : 'توثيق مسجد'}
      footer={
        <button
          type="submit"
          form="mosque-form"
          disabled={saving || compressing}
          className="btn-primary w-full h-13 py-3.5 text-base"
        >
          {saving ? 'جارٍ الحفظ...' : editing ? 'حفظ التعديل' : 'حفظ المسجد'}
        </button>
      }
    >
      <form id="mosque-form" onSubmit={submit} className="p-4 sm:p-5 space-y-5">
        {/* Location */}
        <div className="flex items-center gap-3 rounded-2xl bg-brand-soft/60 border border-brand/15 p-3">
          <div className="w-10 h-10 rounded-xl bg-brand text-gold flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-ink">الموقع محدد على الخريطة</p>
            <p className="text-xs text-muted tabular-nums" dir="ltr">
              {lat.toFixed(5)}, {lng.toFixed(5)}
              {accuracy > 0 ? ` · ±${accuracy}m` : ''}
            </p>
          </div>
          {!editing && (
            <button type="button" onClick={onChangeLocation} className="btn-outline h-9 px-3 text-sm">
              تغيير
            </button>
          )}
        </div>

        {errorMsg && (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm p-3">{errorMsg}</div>
        )}

        {duplicate && (
          <div className="rounded-2xl bg-amber-50 border border-amber-300 p-3.5 space-y-3">
            <div className="flex gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-extrabold text-ink">
                  {duplicate.byName ? 'يوجد مسجد بنفس الاسم' : 'يوجد مسجد موثّق قريب جداً'}
                </p>
                <p className="text-ink/75 mt-0.5">
                  «{duplicate.mosque.officialName}» · {duplicate.mosque.locality} · على بُعد {duplicate.distance} م
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onEditExisting(duplicate.mosque)}
                className="btn-outline h-11 text-sm"
              >
                هو نفسه — افتحه
              </button>
              <button
                type="button"
                onClick={() => {
                  setDuplicate(null);
                  void save();
                }}
                className="btn-primary h-11 text-sm"
              >
                مسجد مختلف — احفظ
              </button>
            </div>
          </div>
        )}

        {/* Name */}
        <div>
          <label htmlFor="f-name" className="label">
            اسم المسجد <span className="text-red-600">*</span>
          </label>
          <input
            id="f-name"
            className="field"
            maxLength={150}
            value={officialName}
            onChange={(e) => setOfficialName(e.target.value)}
            placeholder="مثال: مسجد عمر بن الخطاب"
            autoComplete="off"
          />
        </div>

        {/* Locality */}
        <div>
          <p className="label">
            المحلة / المنطقة <span className="text-red-600">*</span>
          </p>
          {localities.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {localities.slice(0, 10).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => {
                    setLocality(l);
                    setCustomLocality(false);
                  }}
                  className={!customLocality && locality === l ? 'chip-on' : 'chip-off'}
                >
                  {l}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setCustomLocality(true);
                  setLocality('');
                }}
                className={customLocality ? 'chip-on' : 'chip-off'}
              >
                <Plus className="w-4 h-4" />
                أخرى
              </button>
            </div>
          )}
          {(customLocality || localities.length === 0) && (
            <input
              className="field"
              maxLength={100}
              value={locality}
              onChange={(e) => setLocality(e.target.value)}
              placeholder="اكتب اسم المحلة"
              autoComplete="off"
            />
          )}
        </div>

        {/* Photos */}
        <div>
          <p className="label">
            صور المسجد <span className="text-xs font-normal text-muted">({photos.length}/{MAX_PHOTOS})</span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-sand border border-line">
                <img src={p} alt={`صورة ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="حذف الصورة"
                  className="absolute top-1.5 left-1.5 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={compressing}
                className="aspect-square rounded-xl border-2 border-dashed border-brand/35 bg-brand-soft/40 text-brand flex flex-col items-center justify-center gap-1 active:scale-[0.97] transition disabled:opacity-60"
              >
                <Camera className="w-7 h-7" />
                <span className="text-xs font-bold">{compressing ? 'جارٍ...' : 'التقاط صورة'}</span>
              </button>
            )}
          </div>
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              disabled={compressing}
              className="mt-2 text-sm font-bold text-brand flex items-center gap-1.5"
            >
              <ImagePlus className="w-4 h-4" />
              اختيار من المعرض
            </button>
          )}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void addPhotos(e.target.files)}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void addPhotos(e.target.files)}
          />
        </div>

        {/* More */}
        <div className="rounded-2xl border border-line">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="w-full h-12 px-4 flex items-center justify-between text-sm font-bold text-ink"
          >
            <span>
              تفاصيل إضافية <span className="font-normal text-muted">(اختياري)</span>
            </span>
            <ChevronDown className={`w-5 h-5 text-muted transition ${showMore ? 'rotate-180' : ''}`} />
          </button>
          {showMore && (
            <div className="px-4 pb-4 space-y-4">
              <div>
                <label htmlFor="f-common" className="label">
                  الاسم المتداول بين الناس
                </label>
                <input
                  id="f-common"
                  className="field"
                  maxLength={150}
                  value={commonName}
                  onChange={(e) => setCommonName(e.target.value)}
                  placeholder="إن كان مختلفاً عن الاسم الرسمي"
                />
              </div>
              <div>
                <label htmlFor="f-landmark" className="label">
                  علامة دالة
                </label>
                <input
                  id="f-landmark"
                  className="field"
                  maxLength={200}
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="أقرب معلم: مدرسة، مصرف، محطة..."
                />
              </div>
              <div>
                <label htmlFor="f-notes" className="label">
                  ملاحظات
                </label>
                <textarea
                  id="f-notes"
                  className="field h-auto py-3 resize-none"
                  rows={3}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="جامع، قيد الإنشاء، مغلق للصيانة..."
                />
              </div>
            </div>
          )}
        </div>
      </form>
    </BottomSheet>
  );
}
