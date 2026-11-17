import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ExternalLink, Layers, LocateFixed, MapPinPlus, Search, X } from 'lucide-react';
import type { LatLng, MosqueRecord, OsmMosqueCandidate, OsmSettings, UserProfile } from '../types/mosque';
import { MosqueMap, type MosqueMapHandle } from '../components/map/MosqueMap';
import { LocationCard } from '../components/map/LocationCard';
import { MosqueFormSheet } from '../components/MosqueFormSheet';
import { MosqueSheet } from '../components/MosqueSheet';
import { BottomSheet } from '../components/ui/BottomSheet';
import { useUserLocation } from '../lib/location/useUserLocation';
import { updateMosque } from '../lib/supabase/mosques';
import {
  formatDistance,
  generateGoogleMapsSearchUrl,
  haversineDistanceMeters,
  normalizeArabicName,
} from '../lib/utils/geo';

export interface MapFocusRequest {
  lat: number;
  lng: number;
  mosqueId?: string;
  nonce: number;
}

interface MapPageProps {
  mosques: MosqueRecord[];
  osmCandidates: OsmMosqueCandidate[];
  currentUser: UserProfile;
  osmSettings: OsmSettings;
  focus: MapFocusRequest | null;
}

type Placing =
  | { kind: 'new'; prefillName?: string; prefillOsmId?: string }
  | { kind: 'move'; mosque: MosqueRecord };

const SHOW_OSM_KEY = 'awqaf_show_osm_v2';

function readShowOsm(): boolean {
  try {
    return localStorage.getItem(SHOW_OSM_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function MapPage({ mosques, osmCandidates, currentUser, osmSettings, focus }: MapPageProps) {
  const mapRef = useRef<MosqueMapHandle | null>(null);
  const loc = useUserLocation();
  const centeredOnUserRef = useRef(false);

  const [satellite, setSatellite] = useState(false);
  const [showOsm, setShowOsm] = useState(readShowOsm);
  const [locCardHidden, setLocCardHidden] = useState(false);

  const [placing, setPlacing] = useState<Placing | null>(null);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formPos, setFormPos] = useState<(LatLng & { accuracy: number }) | null>(null);
  const [formPrefill, setFormPrefill] = useState<{ name?: string; osmId?: string }>({});
  const [editing, setEditing] = useState<MosqueRecord | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedOsm, setSelectedOsm] = useState<OsmMosqueCandidate | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [movingBusy, setMovingBusy] = useState(false);

  const selectedMosque = useMemo(() => mosques.find((m) => m.id === selectedId) ?? null, [mosques, selectedId]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2600);
  };

  // Center on the employee the first time we know where they are.
  useEffect(() => {
    if (loc.position && !centeredOnUserRef.current && !focus) {
      centeredOnUserRef.current = true;
      mapRef.current?.flyTo(loc.position, 17);
    }
  }, [loc.position, focus]);

  // "Show on map" from the list
  useEffect(() => {
    if (!focus) return;
    mapRef.current?.flyTo(focus, 18);
    if (focus.mosqueId) setSelectedId(focus.mosqueId);
  }, [focus?.nonce]);

  const toggleOsm = () => {
    setShowOsm((v) => {
      try {
        localStorage.setItem(SHOW_OSM_KEY, String(!v));
      } catch {
        // ignore
      }
      return !v;
    });
  };

  const locateMe = () => {
    if (loc.position) mapRef.current?.flyTo(loc.position, 18);
    else loc.start();
    if (loc.permission !== 'granted') setLocCardHidden(false);
  };

  const startPlacing = (p: Placing, at?: LatLng) => {
    setSelectedId(null);
    setSelectedOsm(null);
    setFormOpen(false);
    setPlacing(p);
    const target = at ?? (p.kind === 'move' ? p.mosque : loc.position ?? null);
    if (target) mapRef.current?.flyTo(target, 18);
    if (!loc.position && loc.permission !== 'denied') loc.start();
  };

  const confirmPlacement = async () => {
    if (!placing) return;
    const c = mapRef.current?.getCenter() ?? center;
    if (!c) return;
    const nearUser = loc.position ? haversineDistanceMeters(c.lat, c.lng, loc.position.lat, loc.position.lng) : Infinity;
    const accuracy = nearUser <= 40 && loc.position ? loc.position.accuracy : 0;

    if (placing.kind === 'move') {
      const m = placing.mosque;
      setMovingBusy(true);
      try {
        await updateMosque(
          m.id,
          {
            officialName: m.officialName,
            commonName: m.commonName,
            locality: m.locality,
            landmark: m.landmark,
            notes: m.notes,
            lat: c.lat,
            lng: c.lng,
            accuracy,
            photos: m.photos,
            osmId: m.osmId,
            googlePlaceId: m.googlePlaceId,
          },
          currentUser
        );
        showToast('تم نقل موقع المسجد ✓');
        setPlacing(null);
        setSelectedId(m.id);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'تعذّر نقل الموقع');
      } finally {
        setMovingBusy(false);
      }
      return;
    }

    setFormPos({ lat: c.lat, lng: c.lng, accuracy });
    setFormPrefill({ name: placing.prefillName, osmId: placing.prefillOsmId });
    setEditing(null);
    setPlacing(null);
    setFormOpen(true);
  };

  const onCenterChange = useCallback((c: LatLng) => setCenter(c), []);

  // Search across documented + not-yet-documented mosques
  const results = useMemo(() => {
    const q = normalizeArabicName(query);
    if (!q) return [];
    const ref = loc.position;
    const docs = mosques
      .filter((m) => normalizeArabicName(`${m.officialName} ${m.commonName} ${m.locality}`).includes(q))
      .map((m) => ({ key: m.id, name: m.officialName, sub: m.locality, lat: m.lat, lng: m.lng, mosque: m, osm: null as OsmMosqueCandidate | null }));
    const osm = osmCandidates
      .filter((c) => normalizeArabicName(`${c.nameAr} ${c.nameRaw} ${c.name}`).includes(q))
      .map((c) => ({ key: c.osmId, name: c.nameAr || c.nameRaw || c.name, sub: 'غير موثّق', lat: c.lat, lng: c.lng, mosque: null as MosqueRecord | null, osm: c }));
    return [...docs, ...osm]
      .map((r) => ({ ...r, dist: ref ? haversineDistanceMeters(ref.lat, ref.lng, r.lat, r.lng) : null }))
      .sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0))
      .slice(0, 8);
  }, [query, mosques, osmCandidates, loc.position]);

  const showLocCard = !placing && !locCardHidden && loc.permission !== 'granted' && loc.permission !== 'checking';
  const placingAccuracyHint =
    placing && center && loc.position
      ? haversineDistanceMeters(center.lat, center.lng, loc.position.lat, loc.position.lng)
      : null;

  return (
    <div className="absolute inset-0 overflow-hidden">
      <MosqueMap
        ref={mapRef}
        mosques={mosques}
        osmCandidates={osmCandidates}
        showOsm={showOsm}
        satellite={satellite}
        userLocation={loc.position}
        placing={Boolean(placing)}
        onSelectMosque={(m) => setSelectedId(m.id)}
        onSelectOsm={(c) => setSelectedOsm(c)}
        onCenterChange={onCenterChange}
      />

      {/* ---------------------------------------------------------- top bar */}
      {!placing && (
        <div className="absolute top-3 inset-x-3 z-[500] space-y-2">
          <div className="relative">
            <Search className="w-5 h-5 text-muted absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="ابحث عن مسجد أو محلة"
              className="w-full h-12 pr-11 pl-11 rounded-2xl bg-white/97 border border-line shadow-lg focus:outline-none focus:border-brand"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSearchOpen(false);
                }}
                aria-label="مسح"
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full text-muted flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {searchOpen && query && (
              <div className="absolute top-14 inset-x-0 card shadow-xl overflow-hidden max-h-[50dvh] overflow-y-auto">
                {results.length === 0 ? (
                  <p className="p-4 text-sm text-muted text-center">لا توجد نتائج</p>
                ) : (
                  results.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => {
                        setSearchOpen(false);
                        mapRef.current?.flyTo(r, 18);
                        if (r.mosque) setSelectedId(r.mosque.id);
                        else if (r.osm) setSelectedOsm(r.osm);
                      }}
                      className="w-full px-4 py-3 flex items-center gap-3 text-right border-b border-line/60 last:border-0 hover:bg-sand"
                    >
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${r.mosque ? 'bg-brand' : 'bg-slate-400'}`} />
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold text-ink truncate">{r.name}</span>
                        <span className="block text-xs text-muted">{r.sub}</span>
                      </span>
                      {r.dist !== null && <span className="text-xs text-muted tabular-nums">{formatDistance(r.dist)}</span>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Legend / layer filter */}
          {!searchOpen && (
            <div className="flex gap-2">
              <span className="h-8 px-3 rounded-full bg-white/95 border border-line shadow-sm text-xs font-bold text-ink flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-brand" />
                موثّق {mosques.length}
              </span>
              <button
                type="button"
                onClick={toggleOsm}
                className={`h-8 px-3 rounded-full border shadow-sm text-xs font-bold flex items-center gap-1.5 transition ${
                  showOsm ? 'bg-white/95 border-line text-ink' : 'bg-white/70 border-line text-muted line-through'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                غير موثّق {osmCandidates.length}
              </button>
            </div>
          )}
        </div>
      )}

      {searchOpen && query && (
        <button type="button" aria-label="إغلاق البحث" className="absolute inset-0 z-[400]" onClick={() => setSearchOpen(false)} />
      )}

      {/* ------------------------------------------------------ side buttons */}
      <div className={`absolute left-3 z-[500] flex flex-col gap-2 ${placing ? 'top-28' : 'top-[7.5rem]'}`}>
        <button type="button" onClick={() => setSatellite((v) => !v)} className="map-fab" aria-label="قمر صناعي">
          <Layers className={`w-5 h-5 ${satellite ? 'text-gold' : ''}`} />
        </button>
        <button type="button" onClick={locateMe} className="map-fab" aria-label="موقعي">
          <LocateFixed className={`w-5 h-5 ${loc.locating ? 'animate-spin' : ''} ${loc.position ? 'text-blue-600' : ''}`} />
        </button>
      </div>

      {/* --------------------------------------------------- placement mode */}
      {placing && (
        <>
          <div className="absolute top-3 inset-x-3 z-[500] card shadow-lg p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gold-soft text-brand flex items-center justify-center shrink-0">
              <MapPinPlus className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-ink leading-snug">
                {placing.kind === 'move' ? `نقل موقع: ${placing.mosque.officialName}` : 'حرّك الخريطة حتى يكون الدبوس فوق المسجد'}
              </p>
              <p className="text-xs text-muted">
                {placingAccuracyHint !== null
                  ? `يبعد عنك ${formatDistance(placingAccuracyHint)}${loc.position ? ` · دقة GPS ±${loc.position.accuracy} م` : ''}`
                  : 'كبّر الخريطة أو استخدم القمر الصناعي للدقة'}
              </p>
            </div>
          </div>

          {/* fixed center pin */}
          <div className="absolute left-1/2 top-1/2 z-[450] -translate-x-1/2 -translate-y-full pointer-events-none">
            <svg width="46" height="58" viewBox="0 0 32 40" className="drop-shadow-lg">
              <path
                d="M16 2C8.8 2 3 7.8 3 15c0 10.5 13 23 13 23s13-12.5 13-23C29 7.8 23.2 2 16 2Z"
                fill="#C9A24B"
                stroke="#0F4C3A"
                strokeWidth="2.5"
              />
              <circle cx="16" cy="15" r="5.5" fill="#0F4C3A" />
            </svg>
          </div>
          <div className="absolute left-1/2 top-1/2 z-[440] w-3 h-1.5 -translate-x-1/2 rounded-full bg-black/35 pointer-events-none" />

          <div className="absolute bottom-4 inset-x-3 z-[500] grid grid-cols-[1fr_2fr] gap-2">
            <button type="button" onClick={() => setPlacing(null)} className="btn-outline h-14 shadow-lg">
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => void confirmPlacement()}
              disabled={movingBusy}
              className="btn-primary h-14 text-base shadow-lg"
            >
              <Check className="w-5 h-5 text-gold" />
              {placing.kind === 'move' ? (movingBusy ? 'جارٍ الحفظ...' : 'حفظ الموقع الجديد') : 'هنا المسجد'}
            </button>
          </div>
        </>
      )}

      {/* ------------------------------------------------------ main button */}
      {!placing && (
        <div className="absolute bottom-4 inset-x-3 z-[500] space-y-2 max-w-md mx-auto">
          {showLocCard && (
            <LocationCard
              permission={loc.permission}
              locating={loc.locating}
              onRequest={loc.start}
              onDismiss={() => setLocCardHidden(true)}
            />
          )}
          {loc.permission === 'granted' && loc.issue === 'gps-off' && (
            <p className="card shadow px-3 py-2 text-sm text-amber-800 bg-amber-50 border-amber-200">
              شغّل خدمة الموقع (GPS) في الهاتف.
            </p>
          )}
          <button
            type="button"
            onClick={() => startPlacing({ kind: 'new' })}
            className="btn-primary w-full h-14 text-lg shadow-xl"
          >
            <MapPinPlus className="w-6 h-6 text-gold" />
            توثيق مسجد
          </button>
        </div>
      )}

      {toast && (
        <div className="absolute top-20 inset-x-0 z-[600] flex justify-center pointer-events-none">
          <span className="awqaf-sheet px-4 py-2.5 rounded-full bg-ink text-white text-sm font-bold shadow-lg">{toast}</span>
        </div>
      )}

      {/* ----------------------------------------------------------- sheets */}
      {selectedOsm && (
        <BottomSheet
          open
          onClose={() => setSelectedOsm(null)}
          title={selectedOsm.nameAr || selectedOsm.nameRaw || selectedOsm.name || 'مسجد'}
          subtitle="مسجد موجود على الخريطة العامة ولم يُوثَّق بعد"
        >
          <div className="p-4 sm:p-5 space-y-2.5 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() =>
                startPlacing(
                  {
                    kind: 'new',
                    prefillName: selectedOsm.nameAr || selectedOsm.nameRaw || selectedOsm.name,
                    prefillOsmId: selectedOsm.osmId,
                  },
                  selectedOsm
                )
              }
              className="btn-primary w-full h-14 text-base"
            >
              <MapPinPlus className="w-5 h-5 text-gold" />
              وثّق هذا المسجد
            </button>
            <a
              href={generateGoogleMapsSearchUrl(selectedOsm.lat, selectedOsm.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline w-full h-12 text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              عرضه في خرائط جوجل
            </a>
            {loc.position && (
              <p className="text-center text-xs text-muted">
                يبعد عنك {formatDistance(haversineDistanceMeters(loc.position.lat, loc.position.lng, selectedOsm.lat, selectedOsm.lng))}
              </p>
            )}
          </div>
        </BottomSheet>
      )}

      {selectedMosque && !formOpen && (
        <MosqueSheet
          mosque={selectedMosque}
          currentUser={currentUser}
          osmSettings={osmSettings}
          onClose={() => setSelectedId(null)}
          onEdit={(m) => {
            setSelectedId(null);
            setEditing(m);
            setFormPos({ lat: m.lat, lng: m.lng, accuracy: m.accuracy });
            setFormOpen(true);
          }}
          onMove={(m) => startPlacing({ kind: 'move', mosque: m })}
        />
      )}

      <MosqueFormSheet
        open={formOpen}
        position={formPos}
        editing={editing}
        prefillName={formPrefill.name}
        prefillOsmId={formPrefill.osmId}
        existingMosques={mosques}
        currentUser={currentUser}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onChangeLocation={() => {
          setFormOpen(false);
          startPlacing({ kind: 'new', prefillName: formPrefill.name, prefillOsmId: formPrefill.osmId }, formPos ?? undefined);
        }}
        onEditExisting={(m) => {
          setFormOpen(false);
          setEditing(null);
          setSelectedId(m.id);
          mapRef.current?.flyTo(m, 18);
        }}
        onAddAnother={() => {
          setFormOpen(false);
          setEditing(null);
          startPlacing({ kind: 'new' });
        }}
      />
    </div>
  );
}
