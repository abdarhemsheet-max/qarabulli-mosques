import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Link2, LocateFixed, MapPinCheck, X } from 'lucide-react';
import { GoogleCandidateSheet } from '../components/GoogleCandidateSheet';
import { GoogleMosqueMap } from '../components/GoogleMosqueMap';
import { MosqueDetailSheet } from '../components/MosqueDetailSheet';
import { MosqueFormModal } from '../components/MosqueFormModal';
import { OsmCandidateSheet } from '../components/OsmCandidateSheet';
import { DEFAULT_OSM_SETTINGS } from '../lib/supabase/settings';
import {
  haversineDistanceMeters,
  parseGoogleMapsInput,
  QARABULLI_CENTER,
} from '../lib/utils/geo';
import type {
  GoogleMosqueCandidate,
  MosqueRecord,
  OsmMosqueCandidate,
  OsmSettings,
  UserProfile,
} from '../types/mosque';

interface AddMosquePageProps {
  mosques: MosqueRecord[];
  googleCandidates: GoogleMosqueCandidate[];
  osmCandidates: OsmMosqueCandidate[];
  hasGoogleKey: boolean;
  onMergeGoogleCandidates: (items: GoogleMosqueCandidate[]) => void;
  currentUser: UserProfile;
  osmSettings?: OsmSettings;
  editingMosque: MosqueRecord | null;
  onClearEditing: () => void;
  onSelectExistingForEdit: (mosque: MosqueRecord) => void;
}

export function AddMosquePage({
  mosques,
  googleCandidates,
  osmCandidates,
  hasGoogleKey,
  onMergeGoogleCandidates,
  currentUser,
  osmSettings = DEFAULT_OSM_SETTINGS,
  editingMosque,
  onClearEditing,
  onSelectExistingForEdit,
}: AddMosquePageProps) {
  const [pinPos, setPinPos] = useState(QARABULLI_CENTER);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [flyToTrigger, setFlyToTrigger] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [prefillName, setPrefillName] = useState('');
  const [prefillOsmId, setPrefillOsmId] = useState('');
  const [prefillGooglePlaceId, setPrefillGooglePlaceId] = useState('');
  const [pendingPinAdjustLabel, setPendingPinAdjustLabel] = useState<string | null>(null);
  const [pinMovingMosque, setPinMovingMosque] = useState<MosqueRecord | null>(null);

  const [selectedExistingId, setSelectedExistingId] = useState<string | null>(null);
  const [selectedGoogle, setSelectedGoogle] = useState<GoogleMosqueCandidate | null>(null);
  const [selectedOsm, setSelectedOsm] = useState<OsmMosqueCandidate | null>(null);

  // Google Maps link paste panel
  const [linkPanelOpen, setLinkPanelOpen] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [linkError, setLinkError] = useState('');

  const watchIdRef = useRef<number | null>(null);
  const watchTimerRef = useRef<number | null>(null);
  const autoLocatedOnMountRef = useRef(false);

  const selectedExistingMosque = useMemo(
    () => mosques.find((m) => m.id === selectedExistingId) ?? null,
    [mosques, selectedExistingId]
  );

  const stopGpsWatch = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (watchTimerRef.current !== null) {
      window.clearTimeout(watchTimerRef.current);
      watchTimerRef.current = null;
    }
  }, []);

  const applyPosition = useCallback((pos: GeolocationPosition) => {
    const currentAcc = Math.round(pos.coords.accuracy);
    setPinPos({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    });
    setAccuracy(currentAcc);
    setFlyToTrigger((n) => n + 1);
    setGpsError('');
    return currentAcc;
  }, []);

  const startRefinementWatch = useCallback(() => {
    if (!navigator.geolocation) return;
    stopGpsWatch();

    let bestAcc = Infinity;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const currentAcc = Math.round(pos.coords.accuracy);
        if (currentAcc <= bestAcc) {
          bestAcc = currentAcc;
          applyPosition(pos);
        }
        if (currentAcc <= 15) {
          setLocating(false);
          stopGpsWatch();
        }
      },
      () => {
        setLocating(false);
        stopGpsWatch();
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );

    watchTimerRef.current = window.setTimeout(() => {
      setLocating(false);
      stopGpsWatch();
    }, 10000);
  }, [applyPosition, stopGpsWatch]);

  const handleLocateMe = useCallback(() => {
    setGpsError('');
    if (!navigator.geolocation) {
      setGpsError('المتصفح لا يدعم تحديد الموقع الجغرافي (GPS).');
      return;
    }

    stopGpsWatch();
    setLocating(true);

    const handleFinalGeoError = (err: GeolocationPositionError) => {
      setLocating(false);
      stopGpsWatch();
      if (err.code === err.PERMISSION_DENIED) {
        setGpsError(
          'لم يُسمح بالوصول للموقع. فعّل إذن الموقع في المتصفح (أو افتح الرابط في متصفح الهاتف مباشرة)، أو حرّك الدبوس يدوياً.'
        );
      } else if (err.code === err.TIMEOUT) {
        setGpsError('انتهت مهلة GPS، يمكنك سحب الدبوس أو الضغط على الخريطة لتحديد الموقع.');
      } else {
        setGpsError('تعذّر التقاط إشارة الموقع حالياً، يمكنك تحديد الموقع يدوياً على الخريطة.');
      }
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const acc = applyPosition(pos);
        if (acc <= 20) {
          setLocating(false);
        } else {
          startRefinementWatch();
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          handleFinalGeoError(err);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (fallbackPos) => {
            const acc = applyPosition(fallbackPos);
            if (acc <= 25) {
              setLocating(false);
            } else {
              startRefinementWatch();
            }
          },
          handleFinalGeoError,
          {
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 60000,
          }
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 7000,
        maximumAge: 10000,
      }
    );
  }, [applyPosition, startRefinementWatch, stopGpsWatch]);

  useEffect(() => {
    if (!editingMosque && !autoLocatedOnMountRef.current) {
      autoLocatedOnMountRef.current = true;
      handleLocateMe();
    }
    return () => stopGpsWatch();
  }, [editingMosque, handleLocateMe, stopGpsWatch]);

  useEffect(() => {
    if (editingMosque) {
      stopGpsWatch();
      setLocating(false);
      setPinPos({ lat: editingMosque.lat, lng: editingMosque.lng });
      setAccuracy(editingMosque.accuracy);
      setFlyToTrigger((n) => n + 1);
      setFormOpen(true);
    }
  }, [editingMosque, stopGpsWatch]);

  const handlePositionChange = useCallback((pos: { lat: number; lng: number }) => {
    setPinPos(pos);
  }, []);

  const handleApplyGoogleMapsLink = () => {
    setLinkError('');
    const parsed = parseGoogleMapsInput(linkInput);
    if (!parsed.ok) {
      if (parsed.reason === 'short-link') {
        setLinkError(
          'الرابط المختصر (maps.app.goo.gl) يجب فتحه أولاً في المتصفح ثم نسخ الرابط الكامل الذي يحتوي على الإحداثيات، أو نسخ الإحداثيات (خط العرض، خط الطول).'
        );
      } else {
        setLinkError(
          'لم يُعثر على إحداثيات صالحة في النص. الصق رابط خرائط جوجل الكامل أو الإحداثيات مثل: 32.7501, 14.2902'
        );
      }
      return;
    }

    stopGpsWatch();
    setLocating(false);
    const { lat, lng, placeName } = parsed.data;
    setPinPos({ lat, lng });
    setAccuracy(10);
    setFlyToTrigger((n) => n + 1);
    setLinkPanelOpen(false);
    setLinkInput('');

    const nearbyDocumented = mosques.find(
      (m) => haversineDistanceMeters(lat, lng, m.lat, m.lng) <= 35
    );
    if (nearbyDocumented) {
      setSelectedExistingId(nearbyDocumented.id);
      return;
    }

    setPrefillOsmId('');
    setPrefillGooglePlaceId('');
    setPrefillName(placeName ?? '');
    setFormOpen(true);
  };

  const handleStartGooglePinAdjust = (cand: GoogleMosqueCandidate, editedName?: string) => {
    const resolvedName = (editedName || cand.displayName).trim();
    setSelectedGoogle(null);
    stopGpsWatch();
    setLocating(false);
    setPinPos({ lat: cand.lat, lng: cand.lng });
    setAccuracy(10);
    setFlyToTrigger((n) => n + 1);
    setPinMovingMosque(null);
    setPrefillName(resolvedName);
    setPrefillOsmId('');
    setPrefillGooglePlaceId(cand.placeId);
    setPendingPinAdjustLabel(resolvedName || 'مسجد جوجل المحدد');
  };

  const handleStartExistingPinAdjust = (mosque: MosqueRecord) => {
    setSelectedExistingId(null);
    stopGpsWatch();
    setLocating(false);
    setPinPos({ lat: mosque.lat, lng: mosque.lng });
    setAccuracy(mosque.accuracy);
    setFlyToTrigger((n) => n + 1);
    setPinMovingMosque(mosque);
    setPendingPinAdjustLabel(mosque.officialName);
  };

  const handleVerifyOsmCandidate = (cand: OsmMosqueCandidate) => {
    setSelectedOsm(null);
    stopGpsWatch();
    setLocating(false);
    setPinPos({ lat: cand.lat, lng: cand.lng });
    setAccuracy(10);
    setFlyToTrigger((n) => n + 1);
    const candidateName =
      cand.nameAr ||
      cand.nameRaw ||
      (cand.name !== 'مسجد بدون اسم (OSM)' ? cand.name : '');
    setPrefillName(candidateName);
    setPrefillOsmId(cand.osmId);
    setPrefillGooglePlaceId('');
    setPendingPinAdjustLabel(null);
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setPrefillName('');
    setPrefillOsmId('');
    setPrefillGooglePlaceId('');
    setPendingPinAdjustLabel(null);
    setPinMovingMosque(null);
    if (editingMosque) {
      onClearEditing();
    }
  };

  const handleAddAnother = () => {
    setFormOpen(false);
    setPrefillName('');
    setPrefillOsmId('');
    setPrefillGooglePlaceId('');
    onClearEditing();
    handleLocateMe();
  };

  const weakSignal = accuracy !== null && accuracy > 30;

  return (
    <div className="relative flex-1 w-full min-h-[calc(100dvh-6.5rem)] pb-14 overflow-hidden">
      {/* Near-fullscreen Google Maps Picker View (with offline Leaflet fallback) */}
      <div className="absolute inset-0 bottom-14 isolate z-0">
        <GoogleMosqueMap
          mode="picker"
          center={QARABULLI_CENTER}
          zoom={13}
          selectedPosition={pinPos}
          gpsAccuracy={accuracy}
          mosques={mosques}
          googleCandidates={googleCandidates}
          osmCandidates={osmCandidates}
          hasGoogleKey={hasGoogleKey}
          onMergeGoogleCandidates={onMergeGoogleCandidates}
          onPositionChange={handlePositionChange}
          onSelectMosque={(mosque) => setSelectedExistingId(mosque.id)}
          onSelectGoogleCandidate={(cand) => setSelectedGoogle(cand)}
          onSelectOsmCandidate={(cand) => setSelectedOsm(cand)}
          flyToTrigger={flyToTrigger}
        />
      </div>

      {/* Top GPS status & Paste Google Maps Link control (sits cleanly below map toolbar) */}
      <div className="absolute top-[4.25rem] right-3 left-3 sm:left-auto z-20 flex flex-col items-start gap-2 pointer-events-none">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setLinkError('');
              setLinkPanelOpen((prev) => !prev);
            }}
            className="min-h-[40px] px-3 rounded-xl bg-white/95 backdrop-blur-md border border-[#D8D4C8] text-[#0F4C3A] text-xs font-bold shadow-sm flex items-center gap-1.5 hover:bg-white transition"
          >
            <Link2 className="w-4 h-4 text-[#C9A24B]" />
            <span>لصق رابط من خرائط جوجل</span>
          </button>

          {accuracy !== null && (
            <div
              className={`px-3 py-2 rounded-xl border shadow-sm text-xs font-semibold flex items-center gap-2 backdrop-blur-md ${
                weakSignal
                  ? 'bg-amber-50/95 border-amber-300 text-amber-900'
                  : 'bg-white/95 border-[#D8D4C8] text-[#0F4C3A]'
              }`}
            >
              {weakSignal && <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />}
              <span className="tabular-nums">
                {weakSignal
                  ? `الإشارة ضعيفة، انتظر قليلاً (${accuracy} م)`
                  : `الدقة: ${accuracy} م`}
              </span>
            </div>
          )}
        </div>

        {linkPanelOpen && (
          <div className="pointer-events-auto w-full sm:w-96 bg-white/98 backdrop-blur-md border border-[#D8D4C8] rounded-2xl p-3.5 shadow-xl space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#0F4C3A]">
                جلب موقع مسجد من رابط خرائط جوجل أو الإحداثيات
              </span>
              <button
                type="button"
                onClick={() => setLinkPanelOpen(false)}
                aria-label="إغلاق"
                className="p-1 text-[#5A6561]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              dir="ltr"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder="https://www.google.com/maps/... أو 32.7501, 14.2902"
              className="w-full h-11 px-3 rounded-xl border border-[#D8D4C8] bg-[#FAF8F4] text-base sm:text-xs text-left focus:outline-none focus:border-[#0F4C3A] focus:bg-white"
            />
            {linkError && <p className="text-xs text-red-700 leading-relaxed">{linkError}</p>}
            <button
              type="button"
              onClick={handleApplyGoogleMapsLink}
              className="w-full h-11 rounded-xl bg-[#0F4C3A] text-white font-bold text-xs sm:text-sm hover:bg-[#0B3A2C] transition"
            >
              انتقال إلى الموقع للمراجعة والتوثيق
            </button>
          </div>
        )}

        {gpsError && (
          <div className="pointer-events-auto px-3 py-2 rounded-xl bg-red-50/95 border border-red-200 text-red-800 text-xs font-semibold shadow-sm max-w-xs leading-relaxed">
            {gpsError}
          </div>
        )}
      </div>

      {/* Bottom Floating Mobile Thumb-Zone Action Controls */}
      <div className="absolute bottom-[4.25rem] left-3 right-3 z-20 max-w-xl mx-auto flex flex-col gap-2">
        {pendingPinAdjustLabel && (
          <div className="px-3.5 py-2.5 rounded-xl bg-[#0F4C3A] text-white text-xs font-semibold shadow-lg flex items-center justify-between gap-2 border border-[#C9A24B]/60">
            <span className="leading-relaxed">
              حرّك الدبوس الأخضر إلى موقع «{pendingPinAdjustLabel}» الصحيح، ثم اضغط توثيق موقع مسجد.
            </span>
            <button
              type="button"
              onClick={() => {
                setPendingPinAdjustLabel(null);
                setPinMovingMosque(null);
                setPrefillName('');
                setPrefillGooglePlaceId('');
              }}
              aria-label="إلغاء تعديل الموقع"
              className="p-1 rounded-lg bg-white/15 hover:bg-white/25 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleLocateMe}
            className="h-12 px-4 rounded-xl bg-white/95 backdrop-blur-md border border-[#D8D4C8] text-[#0F4C3A] font-bold text-sm shadow-md flex items-center gap-2 hover:bg-white active:scale-[0.98] transition"
          >
            <LocateFixed className={`w-5 h-5 text-[#C9A24B] ${locating ? 'animate-spin' : ''}`} />
            <span>{locating ? 'جاري تحديد موقعك...' : '📍 موقعي الحالي'}</span>
          </button>

          <div
            dir="ltr"
            className="px-3 py-2 rounded-xl bg-white/92 backdrop-blur-md border border-[#E5E2D9] text-[11px] sm:text-xs text-[#4A5552] tabular-nums shadow-xs"
          >
            {pinPos.lat.toFixed(5)}, {pinPos.lng.toFixed(5)}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!pendingPinAdjustLabel) {
              setPrefillName('');
              setPrefillOsmId('');
              setPrefillGooglePlaceId('');
            }
            setFormOpen(true);
          }}
          className="w-full h-14 rounded-2xl bg-[#0F4C3A] text-white font-bold text-base shadow-lg flex items-center justify-center gap-2 hover:bg-[#0B3A2C] active:scale-[0.98] transition"
        >
          <MapPinCheck className="w-5 h-5 text-[#C9A24B]" />
          <span>
            {pendingPinAdjustLabel
              ? 'حفظ الموقع الجديد وتوثيق المسجد'
              : 'توثيق موقع مسجد'}
          </span>
        </button>
      </div>

      {/* Tap documented green pin to inspect & edit */}
      <MosqueDetailSheet
        mosque={selectedExistingMosque}
        currentUser={currentUser}
        osmSettings={osmSettings}
        onClose={() => setSelectedExistingId(null)}
        onEdit={(mosque) => {
          setSelectedExistingId(null);
          onSelectExistingForEdit(mosque);
        }}
        onMovePin={handleStartExistingPinAdjust}
      />

      {/* Tap pre-existing Google Maps red pin/POI to view all Google photos/details & edit/save directly */}
      <GoogleCandidateSheet
        candidate={selectedGoogle}
        existingMosques={mosques}
        currentUser={currentUser}
        onClose={() => setSelectedGoogle(null)}
        onSwitchToEditExisting={(existing) => onSelectExistingForEdit(existing)}
        onMovePinAndOpenForm={handleStartGooglePinAdjust}
      />

      {/* Tap pre-existing gray OSM pin to review & document */}
      <OsmCandidateSheet
        candidate={selectedOsm}
        onClose={() => setSelectedOsm(null)}
        onVerifyAndDocument={handleVerifyOsmCandidate}
      />

      <MosqueFormModal
        open={formOpen}
        editingMosque={
          editingMosque ??
          (pinMovingMosque
            ? { ...pinMovingMosque, lat: pinPos.lat, lng: pinPos.lng }
            : null)
        }
        initialLat={pinPos.lat}
        initialLng={pinPos.lng}
        initialAccuracy={accuracy ?? 0}
        prefillName={prefillName}
        prefillOsmId={prefillOsmId}
        prefillGooglePlaceId={prefillGooglePlaceId}
        existingMosques={mosques}
        currentUser={currentUser}
        onClose={handleCloseForm}
        onSwitchToEditExisting={(existing) => {
          onSelectExistingForEdit(existing);
        }}
        onSuccessAddAnother={handleAddAnother}
      />
    </div>
  );
}
