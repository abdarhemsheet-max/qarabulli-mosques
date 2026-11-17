import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APILoadingStatus,
  Map as GoogleMap,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import { Layers, RefreshCw } from 'lucide-react';
import {
  fetchGooglePlaceDetails,
  GMP_ATTRIBUTION_ID,
  searchNearbyGoogleMosques,
  searchQarabulliGoogleMosques,
} from '../lib/maps/googleMosques';
import { haversineDistanceMeters, QARABULLI_CENTER } from '../lib/utils/geo';
import type {
  GoogleMosqueCandidate,
  MosqueRecord,
  OsmMosqueCandidate,
} from '../types/mosque';
import { LeafletMap } from './LeafletMap';

interface Coordinates {
  lat: number;
  lng: number;
}

interface GoogleMosqueMapProps {
  mode: 'picker' | 'cluster';
  center?: Coordinates;
  zoom?: number;
  selectedPosition?: Coordinates;
  gpsAccuracy?: number | null;
  mosques?: MosqueRecord[];
  googleCandidates?: GoogleMosqueCandidate[];
  osmCandidates?: OsmMosqueCandidate[];
  hasGoogleKey: boolean;
  onMergeGoogleCandidates?: (items: GoogleMosqueCandidate[]) => void;
  onPositionChange?: (pos: Coordinates) => void;
  onSelectMosque?: (mosque: MosqueRecord) => void;
  onSelectGoogleCandidate?: (candidate: GoogleMosqueCandidate) => void;
  onSelectOsmCandidate?: (candidate: OsmMosqueCandidate) => void;
  flyToTrigger?: number;
  focusLocation?: { lat: number; lng: number; trigger: number } | null;
}

const GOOGLE_LAYER_KEY = 'awqaf_show_google_mosques';
const OSM_LAYER_KEY = 'awqaf_show_existing_osm_layer';

function readStoredToggle(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === 'true';
  } catch {
    return fallback;
  }
}

function formatOsmLabel(cand: OsmMosqueCandidate): string {
  if (cand.nameAr && cand.nameRaw && cand.nameAr !== cand.nameRaw) {
    return `${cand.nameAr} (${cand.nameRaw})`;
  }
  return cand.nameAr || cand.nameRaw || cand.name;
}

interface InnerMapControllerProps {
  mode: 'picker' | 'cluster';
  selectedPosition?: Coordinates;
  gpsAccuracy?: number | null;
  mosques: MosqueRecord[];
  flyToTrigger: number;
  focusLocation: { lat: number; lng: number; trigger: number } | null;
  onInitialGoogleFetch: (placesLib: google.maps.PlacesLibrary) => void;
  onFetchNearbyHere: (center: Coordinates, placesLib: google.maps.PlacesLibrary) => Promise<void>;
  refreshRequestedTrigger: number;
}

function InnerMapController({
  mode,
  selectedPosition,
  gpsAccuracy,
  mosques,
  flyToTrigger,
  focusLocation,
  onInitialGoogleFetch,
  onFetchNearbyHere,
  refreshRequestedTrigger,
}: InnerMapControllerProps) {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const coreLib = useMapsLibrary('core');

  const circleRef = useRef<google.maps.Circle | null>(null);
  const lastFlyTriggerRef = useRef(0);
  const lastFocusTriggerRef = useRef(0);
  const hasFittedBoundsRef = useRef(false);
  const initialFetchSentRef = useRef(false);
  const lastRefreshTriggerRef = useRef(0);

  // One-time initial fetch of Google Maps mosques in Qarabulli once Places library loads
  useEffect(() => {
    if (!placesLib || initialFetchSentRef.current) return;
    initialFetchSentRef.current = true;
    onInitialGoogleFetch(placesLib);
  }, [placesLib, onInitialGoogleFetch]);

  // Manual area refresh when user taps "تحديث مساجد جوجل هنا"
  useEffect(() => {
    if (
      !placesLib ||
      !map ||
      refreshRequestedTrigger === 0 ||
      refreshRequestedTrigger === lastRefreshTriggerRef.current
    ) {
      return;
    }
    lastRefreshTriggerRef.current = refreshRequestedTrigger;
    const center = map.getCenter();
    if (!center) return;
    void onFetchNearbyHere({ lat: center.lat(), lng: center.lng() }, placesLib);
  }, [placesLib, map, refreshRequestedTrigger, onFetchNearbyHere]);

  // Picker GPS accuracy circle
  useEffect(() => {
    if (!map || mode !== 'picker' || !selectedPosition) {
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
      return;
    }

    if (circleRef.current) {
      circleRef.current.setMap(null);
      circleRef.current = null;
    }

    if (gpsAccuracy && gpsAccuracy > 0) {
      circleRef.current = new google.maps.Circle({
        map,
        center: selectedPosition,
        radius: gpsAccuracy,
        strokeColor: '#0F4C3A',
        strokeOpacity: 0.75,
        strokeWeight: 1.5,
        fillColor: '#0F4C3A',
        fillOpacity: 0.1,
        clickable: false,
      });
    }

    return () => {
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
    };
  }, [map, mode, selectedPosition?.lat, selectedPosition?.lng, gpsAccuracy]);

  // Fly to GPS / selected coordinate on trigger
  useEffect(() => {
    if (
      !map ||
      !selectedPosition ||
      flyToTrigger === 0 ||
      flyToTrigger === lastFlyTriggerRef.current
    ) {
      return;
    }
    lastFlyTriggerRef.current = flyToTrigger;
    map.panTo(selectedPosition);
    const curZoom = map.getZoom() ?? 13;
    if (curZoom < 17) {
      map.setZoom(17);
    }
  }, [map, flyToTrigger, selectedPosition?.lat, selectedPosition?.lng]);

  // General map initial fit to documented mosques
  useEffect(() => {
    if (!map || !coreLib || mode !== 'cluster' || hasFittedBoundsRef.current || mosques.length === 0) {
      return;
    }
    const bounds = new coreLib.LatLngBounds();
    mosques.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
    map.fitBounds(bounds, 48);
    hasFittedBoundsRef.current = true;
  }, [map, coreLib, mode, mosques]);

  // General map search focus
  useEffect(() => {
    if (!map || !focusLocation || focusLocation.trigger === lastFocusTriggerRef.current) {
      return;
    }
    lastFocusTriggerRef.current = focusLocation.trigger;
    map.panTo({ lat: focusLocation.lat, lng: focusLocation.lng });
    map.setZoom(17);
  }, [map, focusLocation]);

  return null;
}

export function GoogleMosqueMap({
  mode,
  center = QARABULLI_CENTER,
  zoom = 13,
  selectedPosition,
  gpsAccuracy,
  mosques = [],
  googleCandidates = [],
  osmCandidates = [],
  hasGoogleKey,
  onMergeGoogleCandidates,
  onPositionChange,
  onSelectMosque,
  onSelectGoogleCandidate,
  onSelectOsmCandidate,
  flyToTrigger = 0,
  focusLocation = null,
}: GoogleMosqueMapProps) {
  const apiStatus = useApiLoadingStatus();
  const placesLib = useMapsLibrary('places');

  const [isSatellite, setIsSatellite] = useState(true);
  const [showGoogleLayer, setShowGoogleLayer] = useState<boolean>(() =>
    readStoredToggle(GOOGLE_LAYER_KEY, true)
  );
  const [showOsmLayer, setShowOsmLayer] = useState<boolean>(() =>
    readStoredToggle(OSM_LAYER_KEY, false)
  );
  const [fetchingGoogle, setFetchingGoogle] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [currentZoom, setCurrentZoom] = useState(zoom);
  const [googleFetchError, setGoogleFetchError] = useState('');

  const initialAutoLoadedRef = useRef(false);

  const toggleGoogleLayer = () => {
    setShowGoogleLayer((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(GOOGLE_LAYER_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const toggleOsmLayer = () => {
    setShowOsmLayer((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(OSM_LAYER_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleInitialGoogleFetch = useCallback(
    async (lib: google.maps.PlacesLibrary) => {
      if (initialAutoLoadedRef.current || googleCandidates.length > 0) return;
      initialAutoLoadedRef.current = true;
      setFetchingGoogle(true);
      setGoogleFetchError('');
      try {
        const items = await searchQarabulliGoogleMosques(lib);
        onMergeGoogleCandidates?.(items);
      } catch {
        setGoogleFetchError('تعذّر جلب مساجد خرائط جوجل حالياً.');
      } finally {
        setFetchingGoogle(false);
      }
    },
    [googleCandidates.length, onMergeGoogleCandidates]
  );

  const handleFetchNearbyHere = useCallback(
    async (targetCenter: Coordinates, lib: google.maps.PlacesLibrary) => {
      setFetchingGoogle(true);
      setGoogleFetchError('');
      try {
        const items = await searchNearbyGoogleMosques(lib, targetCenter, 4000);
        onMergeGoogleCandidates?.(items);
      } catch {
        setGoogleFetchError('تعذّر تحديث مساجد جوجل في هذه المنطقة.');
      } finally {
        setFetchingGoogle(false);
      }
    },
    [onMergeGoogleCandidates]
  );

  const handleMapClick = useCallback(
    async (ev: MapMouseEvent) => {
      const placeId = ev.detail.placeId;
      const latLng = ev.detail.latLng;

      // If employee tapped a built-in Google Maps POI icon directly on the map:
      if (placeId) {
        ev.stop();

        // Check if already documented in Awqaf Firestore
        const matchedDoc = mosques.find(
          (m) =>
            (m.googlePlaceId && m.googlePlaceId === placeId) ||
            (latLng && haversineDistanceMeters(latLng.lat, latLng.lng, m.lat, m.lng) <= 35)
        );
        if (matchedDoc) {
          onSelectMosque?.(matchedDoc);
          return;
        }

        // Check if already in loaded Google candidates
        const existingCand = googleCandidates.find((c) => c.placeId === placeId);
        if (existingCand) {
          onSelectGoogleCandidate?.(existingCand);
          return;
        }

        // Otherwise fetch details from Google Places API (New) and accept ONLY mosques
        if (placesLib) {
          const details = await fetchGooglePlaceDetails(placesLib, placeId);
          if (details && details.isMosqueType) {
            onMergeGoogleCandidates?.([details.candidate]);
            onSelectGoogleCandidate?.(details.candidate);
            return;
          }
        }
      }

      if (mode === 'picker' && latLng) {
        onPositionChange?.({ lat: latLng.lat, lng: latLng.lng });
      }
    },
    [
      mode,
      mosques,
      googleCandidates,
      placesLib,
      onPositionChange,
      onSelectMosque,
      onSelectGoogleCandidate,
      onMergeGoogleCandidates,
    ]
  );

  const shouldUseLeafletFallback =
    !hasGoogleKey ||
    apiStatus === APILoadingStatus.FAILED ||
    apiStatus === APILoadingStatus.AUTH_FAILURE;

  if (shouldUseLeafletFallback) {
    return (
      <LeafletMap
        mode={mode}
        center={center}
        zoom={zoom}
        selectedPosition={selectedPosition}
        gpsAccuracy={gpsAccuracy}
        mosques={mosques}
        osmCandidates={osmCandidates}
        onPositionChange={onPositionChange}
        onSelectMosque={onSelectMosque}
        onSelectOsmCandidate={onSelectOsmCandidate}
        flyToTrigger={flyToTrigger}
        focusLocation={focusLocation}
      />
    );
  }

  const showLabels = currentZoom >= 13;

  return (
    <div className="relative w-full h-full isolate">
      <GoogleMap
        mapId="DEMO_MAP_ID"
        internalUsageAttributionIds={[GMP_ATTRIBUTION_ID]}
        defaultCenter={center}
        defaultZoom={zoom}
        mapTypeId={isSatellite ? 'satellite' : 'roadmap'}
        gestureHandling="greedy"
        disableDefaultUI={true}
        zoomControl={true}
        clickableIcons={true}
        onClick={(ev) => void handleMapClick(ev)}
        onZoomChanged={(ev) => setCurrentZoom(ev.detail.zoom)}
        style={{ width: '100%', height: '100%' }}
      >
        <InnerMapController
          mode={mode}
          selectedPosition={selectedPosition}
          gpsAccuracy={gpsAccuracy}
          mosques={mosques}
          flyToTrigger={flyToTrigger}
          focusLocation={focusLocation}
          onInitialGoogleFetch={handleInitialGoogleFetch}
          onFetchNearbyHere={handleFetchNearbyHere}
          refreshRequestedTrigger={refreshTrigger}
        />

        {/* Picker Target Draggable Pin */}
        {mode === 'picker' && selectedPosition && (
          <AdvancedMarker
            position={selectedPosition}
            draggable={true}
            zIndex={1000}
            title="موقع المسجد المحدد للتوثيق"
            onDragEnd={(e) => {
              if (e.latLng) {
                onPositionChange?.({ lat: e.latLng.lat(), lng: e.latLng.lng() });
              }
            }}
          >
            <div className="flex flex-col items-center pointer-events-none select-none">
              <svg width="42" height="52" viewBox="0 0 42 52" fill="none">
                <path
                  d="M21 2C11.0589 2 3 10.0589 3 20C3 33.5 21 50 21 50C21 50 39 33.5 39 20C39 10.0589 30.9411 2 21 2Z"
                  fill="#0F4C3A"
                  stroke="#FFFFFF"
                  strokeWidth="3"
                />
                <circle cx="21" cy="20" r="8" fill="#C9A24B" stroke="#FFFFFF" strokeWidth="2" />
              </svg>
            </div>
          </AdvancedMarker>
        )}

        {/* Pre-existing Google Maps Mosques (Red pins + Google-style crisp labels) */}
        {showGoogleLayer &&
          googleCandidates.map((cand) => (
            <AdvancedMarker
              key={`g_${cand.placeId}`}
              position={{ lat: cand.lat, lng: cand.lng }}
              zIndex={200}
              title={cand.displayName || 'مسجد على خرائط جوجل'}
              onClick={() => onSelectGoogleCandidate?.(cand)}
            >
              <div className="relative flex flex-col items-center cursor-pointer group">
                <svg
                  width="32"
                  height="42"
                  viewBox="0 0 32 42"
                  fill="none"
                  className="drop-shadow-md transition-transform group-hover:scale-110"
                >
                  <path
                    d="M16 2C8.26801 2 2 8.26801 2 16C2 26.5 16 40 16 40C16 40 30 26.5 30 16C30 8.26801 23.732 2 16 2Z"
                    fill="#EA4335"
                    stroke="#FFFFFF"
                    strokeWidth="2.5"
                  />
                  <circle cx="16" cy="15.5" r="5" fill="#991B1B" />
                </svg>
                {showLabels && (
                  <span
                    className={`mt-0.5 text-[12px] font-extrabold leading-tight whitespace-nowrap px-1 pointer-events-none ${
                      isSatellite ? 'awqaf-gmap-label-sat' : 'awqaf-gmap-label-light'
                    }`}
                  >
                    {cand.displayName || 'مسجد بدون اسم'}
                  </span>
                )}
              </div>
            </AdvancedMarker>
          ))}

        {/* Optional OSM Overpass Layer (Gray pins, preserved from Prompt 8) */}
        {showOsmLayer &&
          osmCandidates.map((cand) => (
            <AdvancedMarker
              key={`osm_${cand.osmId}`}
              position={{ lat: cand.lat, lng: cand.lng }}
              zIndex={100}
              title={formatOsmLabel(cand)}
              onClick={() => onSelectOsmCandidate?.(cand)}
            >
              <div className="relative flex flex-col items-center cursor-pointer">
                <svg width="26" height="34" viewBox="0 0 28 36" fill="none" className="drop-shadow">
                  <path
                    d="M14 2C7.92487 2 3 6.92487 3 13C3 21.75 14 34 14 34C14 34 25 21.75 25 13C25 6.92487 20.0751 2 14 2Z"
                    fill="#64748B"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />
                  <circle cx="14" cy="13" r="4.5" fill="#334155" />
                </svg>
                {showLabels && (
                  <span
                    className={`mt-0.5 text-[11px] font-bold leading-tight whitespace-nowrap px-1 pointer-events-none ${
                      isSatellite ? 'awqaf-gmap-label-sat' : 'awqaf-gmap-label-light'
                    }`}
                  >
                    {formatOsmLabel(cand)}
                  </span>
                )}
              </div>
            </AdvancedMarker>
          ))}

        {/* Documented Awqaf Mosques (Green pins + Gold core) */}
        {mosques.map((mosque) => (
          <AdvancedMarker
            key={mosque.id}
            position={{ lat: mosque.lat, lng: mosque.lng }}
            zIndex={350}
            title={mosque.officialName}
            onClick={() => onSelectMosque?.(mosque)}
          >
            <div className="relative flex flex-col items-center cursor-pointer group">
              <svg
                width="34"
                height="42"
                viewBox="0 0 32 40"
                fill="none"
                className="drop-shadow-md transition-transform group-hover:scale-110"
              >
                <path
                  d="M16 2C8.8203 2 3 7.8203 3 15C3 25.5 16 38 16 38C16 38 29 25.5 29 15C29 7.8203 23.1797 2 16 2Z"
                  fill="#0F4C3A"
                  stroke="#FFFFFF"
                  strokeWidth="2.5"
                />
                <circle cx="16" cy="15" r="5.5" fill="#C9A24B" />
              </svg>
              {showLabels && (
                <span
                  className={`mt-0.5 text-[12px] font-extrabold leading-tight whitespace-nowrap px-1 pointer-events-none ${
                    isSatellite ? 'awqaf-gmap-label-sat-green' : 'awqaf-gmap-label-green'
                  }`}
                >
                  {mosque.officialName}
                </span>
              )}
            </div>
          </AdvancedMarker>
        ))}
      </GoogleMap>

      {/* Top Controls: Street/Hybrid Satellite Switch + Google Mosques + OSM Layer + Scan Here */}
      <div className="absolute top-3 right-3 left-3 z-20 flex items-center gap-1.5 overflow-x-auto pb-1 pointer-events-none">
        <div className="pointer-events-auto shrink-0 p-1 rounded-xl bg-white/95 backdrop-blur-md border border-[#D8D4C8] shadow-md flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsSatellite(false)}
            className={`min-h-[36px] px-2 sm:px-2.5 rounded-lg text-[11px] sm:text-xs font-bold transition whitespace-nowrap ${
              !isSatellite
                ? 'bg-[#0F4C3A] text-white'
                : 'text-[#4A5552] hover:text-[#0F4C3A]'
            }`}
          >
            خريطة الشوارع
          </button>
          <button
            type="button"
            onClick={() => setIsSatellite(true)}
            className={`min-h-[36px] px-2 sm:px-2.5 rounded-lg text-[11px] sm:text-xs font-bold flex items-center gap-1 transition whitespace-nowrap ${
              isSatellite
                ? 'bg-[#0F4C3A] text-white'
                : 'text-[#4A5552] hover:text-[#0F4C3A]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-[#C9A24B]" />
            <span>قمر صناعي</span>
          </button>
        </div>

        {/* Google Maps Pre-existing Mosques Toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={showGoogleLayer}
          onClick={toggleGoogleLayer}
          className={`pointer-events-auto min-h-[44px] px-2.5 rounded-xl border shadow-md backdrop-blur-md flex items-center gap-2 text-[11px] sm:text-xs font-bold transition whitespace-nowrap ${
            showGoogleLayer
              ? 'bg-white/95 border-[#EA4335] text-[#1A2421]'
              : 'bg-white/85 border-[#D8D4C8] text-[#5A6561]'
          }`}
        >
          <span
            aria-hidden="true"
            className={`w-7 h-4 rounded-full p-0.5 transition-colors flex items-center ${
              showGoogleLayer ? 'bg-[#EA4335] justify-start' : 'bg-[#D8D4C8] justify-end'
            }`}
          >
            <span className="w-3 h-3 rounded-full bg-white shadow-xs block" />
          </span>
          <span>مساجد جوجل</span>
          <span className="tabular-nums text-[#5A6561]">({googleCandidates.length})</span>
        </button>

        {/* Fetch Google Mosques in Current Viewport Button */}
        <button
          type="button"
          onClick={() => setRefreshTrigger((n) => n + 1)}
          disabled={fetchingGoogle || !placesLib}
          title="جلب المساجد المسجلة في خرائط جوجل داخل هذه المنطقة"
          className="pointer-events-auto min-h-[44px] px-2.5 rounded-xl bg-white/95 backdrop-blur-md border border-[#D8D4C8] text-[#0F4C3A] text-[11px] sm:text-xs font-bold shadow-md flex items-center gap-1.5 hover:bg-white disabled:opacity-60 transition whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#EA4335] ${fetchingGoogle ? 'animate-spin' : ''}`} />
          <span>{fetchingGoogle ? 'جاري الجلب...' : 'جلب مساجد جوجل هنا'}</span>
        </button>

        {/* Preserved OSM Toggle */}
        {osmCandidates.length > 0 && (
          <button
            type="button"
            role="switch"
            aria-checked={showOsmLayer}
            onClick={toggleOsmLayer}
            title="إظهار أو إخفاء طبقة OpenStreetMap"
            className={`pointer-events-auto min-h-[44px] px-2.5 rounded-xl border shadow-md backdrop-blur-md flex items-center gap-1.5 text-[11px] sm:text-xs font-bold transition whitespace-nowrap ${
              showOsmLayer
                ? 'bg-white/95 border-[#64748B] text-[#1A2421]'
                : 'bg-white/85 border-[#D8D4C8] text-[#5A6561]'
            }`}
          >
            <span>OSM ({osmCandidates.length})</span>
          </button>
        )}
      </div>

      {googleFetchError && (
        <div className="absolute top-16 right-3 z-20 px-3 py-1.5 rounded-xl bg-red-50/95 border border-red-200 text-red-800 text-xs font-semibold shadow">
          {googleFetchError}
        </div>
      )}
    </div>
  );
}
