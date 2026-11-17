import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { Layers } from 'lucide-react';
import type { MosqueRecord, OsmMosqueCandidate } from '../types/mosque';
import { QARABULLI_CENTER } from '../lib/utils/geo';

interface Coordinates {
  lat: number;
  lng: number;
}

interface LeafletMapProps {
  mode: 'picker' | 'cluster';
  center?: Coordinates;
  zoom?: number;
  selectedPosition?: Coordinates;
  gpsAccuracy?: number | null;
  mosques?: MosqueRecord[];
  osmCandidates?: OsmMosqueCandidate[];
  onPositionChange?: (pos: Coordinates) => void;
  onSelectMosque?: (mosque: MosqueRecord) => void;
  onSelectOsmCandidate?: (candidate: OsmMosqueCandidate) => void;
  flyToTrigger?: number;
  focusLocation?: { lat: number; lng: number; trigger: number } | null;
}

function createTargetPinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'awqaf-pin-icon',
    iconSize: [42, 52],
    iconAnchor: [21, 50],
    html: `
      <svg width="42" height="52" viewBox="0 0 42 52" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 2C11.0589 2 3 10.0589 3 20C3 33.5 21 50 21 50C21 50 39 33.5 39 20C39 10.0589 30.9411 2 21 2Z" fill="#0F4C3A" stroke="#FFFFFF" stroke-width="3"/>
        <circle cx="21" cy="20" r="8" fill="#C9A24B" stroke="#FFFFFF" stroke-width="2"/>
      </svg>
    `,
  });
}

function createMosquePinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'awqaf-pin-icon',
    iconSize: [32, 40],
    iconAnchor: [16, 38],
    html: `
      <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 2C8.8203 2 3 7.8203 3 15C3 25.5 16 38 16 38C16 38 29 25.5 29 15C29 7.8203 23.1797 2 16 2Z" fill="#0F4C3A" stroke="#FFFFFF" stroke-width="2.5"/>
        <circle cx="16" cy="15" r="5" fill="#C9A24B"/>
      </svg>
    `,
  });
}

function createOsmGrayPinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'awqaf-pin-icon',
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    html: `
      <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 2C7.92487 2 3 6.92487 3 13C3 21.75 14 34 14 34C14 34 25 21.75 25 13C25 6.92487 20.0751 2 14 2Z" fill="#64748B" stroke="#FFFFFF" stroke-width="2"/>
        <circle cx="14" cy="13" r="4.5" fill="#334155"/>
      </svg>
    `,
  });
}

function formatOsmLabel(cand: OsmMosqueCandidate): string {
  if (cand.nameAr && cand.nameRaw && cand.nameAr !== cand.nameRaw) {
    return `${cand.nameAr} (${cand.nameRaw})`;
  }
  return cand.nameAr || cand.nameRaw || cand.name;
}

const OSM_LAYER_STORAGE_KEY = 'awqaf_show_existing_osm_layer';

function readInitialOsmLayerState(): boolean {
  try {
    const raw = localStorage.getItem(OSM_LAYER_STORAGE_KEY);
    return raw === null ? false : raw === 'true';
  } catch {
    return false;
  }
}

type MarkerClusterFactory = (options?: {
  maxClusterRadius?: number;
  spiderfyOnMaxZoom?: boolean;
  showCoverageOnHover?: boolean;
  iconCreateFunction?: (cluster: { getChildCount: () => number }) => L.DivIcon;
}) => L.LayerGroup;

export function LeafletMap({
  mode,
  center = QARABULLI_CENTER,
  zoom = 13,
  selectedPosition,
  gpsAccuracy,
  mosques = [],
  osmCandidates = [],
  onPositionChange,
  onSelectMosque,
  onSelectOsmCandidate,
  flyToTrigger = 0,
  focusLocation = null,
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const osmLayerRef = useRef<L.TileLayer | null>(null);
  const satelliteLayerRef = useRef<L.LayerGroup | null>(null);
  const pickerMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const clusterGroupRef = useRef<L.LayerGroup | null>(null);
  const referenceGroupRef = useRef<L.LayerGroup | null>(null);
  const hasFittedBoundsRef = useRef(false);
  const lastFlyTriggerRef = useRef(0);

  const [isSatellite, setIsSatellite] = useState(false);
  const [showExistingLayer, setShowExistingLayer] = useState<boolean>(readInitialOsmLayerState);

  const toggleExistingLayer = () => {
    setShowExistingLayer((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(OSM_LAYER_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: false,
    });

    L.control.zoom({ position: 'topleft' }).addTo(map);

    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    });

    const satelliteImagery = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: '&copy; Esri World Imagery',
      }
    );

    const satelliteRoads = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        opacity: 0.78,
      }
    );

    const satelliteHybrid = L.layerGroup([satelliteImagery, satelliteRoads]);

    osm.addTo(map);
    osmLayerRef.current = osm;
    satelliteLayerRef.current = satelliteHybrid;
    mapRef.current = map;

    const updateZoomLabelVisibility = () => {
      const el = containerRef.current;
      if (!el) return;
      if (map.getZoom() >= 13) {
        el.classList.remove('awqaf-hide-labels');
      } else {
        el.classList.add('awqaf-hide-labels');
      }
    };
    updateZoomLabelVisibility();
    map.on('zoomend', updateZoomLabelVisibility);

    const handleResize = () => {
      map.invalidateSize();
    };
    const resizeTimer = window.setTimeout(handleResize, 150);
    window.addEventListener('resize', handleResize);

    return () => {
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
      map.off('zoomend', updateZoomLabelVisibility);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Switch between OpenStreetMap and Satellite Hybrid tiles
  useEffect(() => {
    const map = mapRef.current;
    const osm = osmLayerRef.current;
    const sat = satelliteLayerRef.current;
    const el = containerRef.current;
    if (!map || !osm || !sat) return;

    if (isSatellite) {
      if (map.hasLayer(osm)) map.removeLayer(osm);
      if (!map.hasLayer(sat)) sat.addTo(map);
      el?.classList.add('awqaf-satellite-mode');
    } else {
      if (map.hasLayer(sat)) map.removeLayer(sat);
      if (!map.hasLayer(osm)) osm.addTo(map);
      el?.classList.remove('awqaf-satellite-mode');
    }
  }, [isSatellite]);

  // Picker mode: tap map & draggable pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== 'picker' || !selectedPosition) return;

    if (!pickerMarkerRef.current) {
      const marker = L.marker([selectedPosition.lat, selectedPosition.lng], {
        draggable: true,
        icon: createTargetPinIcon(),
        zIndexOffset: 1000,
      }).addTo(map);

      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        onPositionChange?.({ lat: ll.lat, lng: ll.lng });
      });

      pickerMarkerRef.current = marker;
    } else {
      pickerMarkerRef.current.setLatLng([selectedPosition.lat, selectedPosition.lng]);
    }

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      onPositionChange?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [mode, selectedPosition?.lat, selectedPosition?.lng, onPositionChange]);

  // Picker mode: GPS accuracy circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== 'picker' || !selectedPosition) return;

    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.remove();
      accuracyCircleRef.current = null;
    }

    if (gpsAccuracy && gpsAccuracy > 0) {
      accuracyCircleRef.current = L.circle([selectedPosition.lat, selectedPosition.lng], {
        radius: gpsAccuracy,
        color: '#0F4C3A',
        fillColor: '#0F4C3A',
        fillOpacity: 0.1,
        weight: 1.5,
      }).addTo(map);
    }
  }, [mode, selectedPosition?.lat, selectedPosition?.lng, gpsAccuracy]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedPosition || flyToTrigger === 0 || flyToTrigger === lastFlyTriggerRef.current) {
      return;
    }
    lastFlyTriggerRef.current = flyToTrigger;
    map.stop();
    map.flyTo([selectedPosition.lat, selectedPosition.lng], Math.max(map.getZoom(), 17), {
      duration: 0.6,
    });
  }, [flyToTrigger, selectedPosition?.lat, selectedPosition?.lng]);

  // Picker mode: render documented Awqaf mosques (green) + pre-existing OSM mosques (gray)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== 'picker') return;

    if (referenceGroupRef.current) {
      referenceGroupRef.current.clearLayers();
    } else {
      referenceGroupRef.current = L.layerGroup().addTo(map);
    }

    const documentedIcon = createMosquePinIcon();
    const grayOsmIcon = createOsmGrayPinIcon();

    if (showExistingLayer) {
      osmCandidates.forEach((cand) => {
        const marker = L.marker([cand.lat, cand.lng], {
          icon: grayOsmIcon,
          interactive: true,
        });
        marker.bindTooltip(formatOsmLabel(cand), {
          permanent: true,
          direction: 'right',
          offset: [12, -18],
          className: 'awqaf-mosque-tooltip awqaf-osm-gray-tooltip',
        });
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectOsmCandidate?.(cand);
        });
        referenceGroupRef.current?.addLayer(marker);
      });
    }

    mosques.forEach((m) => {
      const refMarker = L.marker([m.lat, m.lng], {
        icon: documentedIcon,
        interactive: true,
        zIndexOffset: 200,
      });
      refMarker.bindTooltip(m.officialName, {
        permanent: true,
        direction: 'right',
        offset: [12, -20],
        className: 'awqaf-mosque-tooltip',
      });
      refMarker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectMosque?.(m);
      });
      referenceGroupRef.current?.addLayer(refMarker);
    });
  }, [mode, mosques, osmCandidates, showExistingLayer, onSelectMosque, onSelectOsmCandidate]);

  // Cluster mode: General map with marker clustering
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== 'cluster') return;

    if (clusterGroupRef.current) {
      map.removeLayer(clusterGroupRef.current);
      clusterGroupRef.current = null;
    }

    const factory = (L as unknown as { markerClusterGroup?: MarkerClusterFactory })
      .markerClusterGroup;

    const group: L.LayerGroup = factory
      ? factory({
          maxClusterRadius: 45,
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          iconCreateFunction: (cluster) =>
            L.divIcon({
              html: `<div class="awqaf-cluster-badge">${cluster.getChildCount()}</div>`,
              className: 'awqaf-cluster-icon',
              iconSize: [40, 40],
            }),
        })
      : L.layerGroup();

    const mosqueIcon = createMosquePinIcon();
    const grayOsmIcon = createOsmGrayPinIcon();

    if (showExistingLayer) {
      osmCandidates.forEach((cand) => {
        const marker = L.marker([cand.lat, cand.lng], { icon: grayOsmIcon });
        marker.bindTooltip(formatOsmLabel(cand), {
          permanent: true,
          direction: 'right',
          offset: [12, -18],
          className: 'awqaf-mosque-tooltip awqaf-osm-gray-tooltip',
        });
        marker.on('click', () => {
          onSelectOsmCandidate?.(cand);
        });
        group.addLayer(marker);
      });
    }

    mosques.forEach((mosque) => {
      const marker = L.marker([mosque.lat, mosque.lng], { icon: mosqueIcon });
      marker.bindTooltip(mosque.officialName, {
        permanent: true,
        direction: 'right',
        offset: [12, -20],
        className: 'awqaf-mosque-tooltip',
      });
      marker.on('click', () => {
        onSelectMosque?.(mosque);
      });
      group.addLayer(marker);
    });

    group.addTo(map);
    clusterGroupRef.current = group;

    if (mosques.length > 0 && !hasFittedBoundsRef.current) {
      const bounds = L.latLngBounds(mosques.map((m) => [m.lat, m.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
      hasFittedBoundsRef.current = true;
    }
  }, [mode, mosques, osmCandidates, showExistingLayer, onSelectMosque, onSelectOsmCandidate]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusLocation) return;
    map.flyTo([focusLocation.lat, focusLocation.lng], 17, { duration: 0.7 });
  }, [focusLocation?.trigger]);

  return (
    <div className="relative w-full h-full isolate">
      <div ref={containerRef} className="w-full h-full z-0" />

      {/* Top-Right Controls: Street/Satellite Switch + Pre-existing OSM Mosques Layer Toggle */}
      <div className="absolute top-3 right-3 left-14 sm:left-auto z-[900] flex flex-wrap items-center gap-1.5 pointer-events-none">
        <div className="pointer-events-auto p-1 rounded-xl bg-white/95 backdrop-blur-md border border-[#D8D4C8] shadow-md flex items-center gap-1">
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

        <button
          type="button"
          role="switch"
          aria-checked={showExistingLayer}
          onClick={toggleExistingLayer}
          title="إظهار أو إخفاء طبقة «مساجد موجودة مسبقاً»"
          className={`pointer-events-auto min-h-[44px] px-2.5 rounded-xl border shadow-md backdrop-blur-md flex items-center gap-2 text-[11px] sm:text-xs font-bold transition whitespace-nowrap ${
            showExistingLayer
              ? 'bg-white/95 border-[#64748B] text-[#1A2421]'
              : 'bg-white/85 border-[#D8D4C8] text-[#5A6561]'
          }`}
        >
          <span
            aria-hidden="true"
            className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${
              showExistingLayer ? 'bg-[#64748B] justify-start' : 'bg-[#D8D4C8] justify-end'
            }`}
          >
            <span className="w-3.5 h-3.5 rounded-full bg-white shadow-xs block" />
          </span>
          <span className="hidden sm:inline">مساجد موجودة مسبقاً</span>
          <span className="sm:hidden">موجودة مسبقاً</span>
          <span className="tabular-nums text-[#5A6561]">({osmCandidates.length})</span>
        </button>
      </div>
    </div>
  );
}
