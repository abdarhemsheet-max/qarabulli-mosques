import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import L from 'leaflet';
import type { LatLng, MosqueRecord, OsmMosqueCandidate } from '../../types/mosque';
import { QARABULLI_CENTER } from '../../lib/utils/geo';

export interface MosqueMapHandle {
  flyTo: (pos: LatLng, zoom?: number) => void;
  getCenter: () => LatLng;
}

interface MosqueMapProps {
  mosques: MosqueRecord[];
  osmCandidates: OsmMosqueCandidate[];
  showOsm: boolean;
  satellite: boolean;
  userLocation: (LatLng & { accuracy: number }) | null;
  /** While placing a pin the markers are dimmed and not tappable. */
  placing: boolean;
  onSelectMosque: (mosque: MosqueRecord) => void;
  onSelectOsm: (candidate: OsmMosqueCandidate) => void;
  onCenterChange?: (center: LatLng) => void;
}

function pinSvg(fill: string, dot: string, size: number): string {
  const h = Math.round(size * 1.25);
  return `<svg width="${size}" height="${h}" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 2C8.8 2 3 7.8 3 15c0 10.5 13 23 13 23s13-12.5 13-23C29 7.8 23.2 2 16 2Z" fill="${fill}" stroke="#fff" stroke-width="2.5"/>
    <circle cx="16" cy="15" r="5.2" fill="${dot}"/>
  </svg>`;
}

const ICONS = {
  documented: L.divIcon({
    className: 'awqaf-pin-icon',
    iconSize: [34, 42],
    iconAnchor: [17, 40],
    html: pinSvg('#0F4C3A', '#C9A24B', 34),
  }),
  live: L.divIcon({
    className: 'awqaf-pin-icon',
    iconSize: [34, 42],
    iconAnchor: [17, 40],
    html: pinSvg('#0F4C3A', '#FFFFFF', 34),
  }),
  osm: L.divIcon({
    className: 'awqaf-pin-icon',
    iconSize: [28, 35],
    iconAnchor: [14, 33],
    html: pinSvg('#94A3B8', '#FFFFFF', 28),
  }),
};

function osmLabel(c: OsmMosqueCandidate): string {
  return c.nameAr || c.nameRaw || c.name || 'مسجد';
}

export const MosqueMap = forwardRef<MosqueMapHandle, MosqueMapProps>(function MosqueMap(
  {
    mosques,
    osmCandidates,
    showOsm,
    satellite,
    userLocation,
    placing,
    onSelectMosque,
    onSelectOsm,
    onCenterChange,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const streetRef = useRef<L.TileLayer | null>(null);
  const satRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const meRef = useRef<{ dot: L.Marker; circle: L.Circle } | null>(null);

  // Keep latest callbacks without re-binding Leaflet handlers.
  const cbRef = useRef({ onSelectMosque, onSelectOsm, onCenterChange });
  cbRef.current = { onSelectMosque, onSelectOsm, onCenterChange };

  useImperativeHandle(ref, () => ({
    flyTo: (pos, zoom = 18) => {
      const map = mapRef.current;
      if (!map) return;
      map.stop();
      map.flyTo([pos.lat, pos.lng], Math.max(zoom, map.getZoom()), { duration: 0.6 });
    },
    getCenter: () => {
      const c = mapRef.current?.getCenter();
      return c ? { lat: c.lat, lng: c.lng } : QARABULLI_CENTER;
    },
  }));

  // Init once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [QARABULLI_CENTER.lat, QARABULLI_CENTER.lng],
      zoom: 13,
      zoomControl: false,
      attributionControl: true,
    });
    map.attributionControl.setPrefix(false);

    streetRef.current = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);

    satRef.current = L.layerGroup([
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: '© Esri' }
      ),
      L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, opacity: 0.75 }
      ),
    ]);

    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const updateLabels = () => {
      containerRef.current?.classList.toggle('awqaf-hide-labels', map.getZoom() < 15);
    };
    const reportCenter = () => {
      const c = map.getCenter();
      cbRef.current.onCenterChange?.({ lat: c.lat, lng: c.lng });
    };
    updateLabels();
    map.on('zoomend', updateLabels);
    map.on('move', reportCenter);

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.off();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Street / satellite
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !streetRef.current || !satRef.current) return;
    if (satellite) {
      map.removeLayer(streetRef.current);
      satRef.current.addTo(map);
    } else {
      map.removeLayer(satRef.current);
      streetRef.current.addTo(map);
    }
    containerRef.current?.classList.toggle('awqaf-satellite', satellite);
  }, [satellite]);

  // Markers
  useEffect(() => {
    const group = markersRef.current;
    if (!group) return;
    group.clearLayers();

    if (showOsm) {
      osmCandidates.forEach((c) => {
        const m = L.marker([c.lat, c.lng], {
          icon: ICONS.osm,
          interactive: !placing,
          opacity: placing ? 0.45 : 1,
        });
        m.bindTooltip(osmLabel(c), {
          permanent: true,
          direction: 'right',
          offset: [10, -18],
          className: 'awqaf-mosque-tooltip awqaf-osm-tooltip',
        });
        m.on('click', () => cbRef.current.onSelectOsm(c));
        group.addLayer(m);
      });
    }

    mosques.forEach((mosque) => {
      const m = L.marker([mosque.lat, mosque.lng], {
        icon: mosque.googleMapsStatus === 'live' ? ICONS.live : ICONS.documented,
        interactive: !placing,
        opacity: placing ? 0.55 : 1,
        zIndexOffset: 200,
      });
      m.bindTooltip(mosque.officialName, {
        permanent: true,
        direction: 'right',
        offset: [12, -22],
        className: 'awqaf-mosque-tooltip',
      });
      m.on('click', () => cbRef.current.onSelectMosque(mosque));
      group.addLayer(m);
    });
  }, [mosques, osmCandidates, showOsm, placing]);

  // "You are here"
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!userLocation) {
      meRef.current?.dot.remove();
      meRef.current?.circle.remove();
      meRef.current = null;
      return;
    }
    const ll: L.LatLngExpression = [userLocation.lat, userLocation.lng];
    if (!meRef.current) {
      const circle = L.circle(ll, {
        radius: userLocation.accuracy,
        color: '#2563eb',
        weight: 1,
        fillColor: '#2563eb',
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(map);
      const dot = L.marker(ll, {
        icon: L.divIcon({ className: 'awqaf-pin-icon', html: '<div class="awqaf-me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        interactive: false,
        zIndexOffset: 500,
      }).addTo(map);
      meRef.current = { dot, circle };
    } else {
      meRef.current.dot.setLatLng(ll);
      meRef.current.circle.setLatLng(ll);
      meRef.current.circle.setRadius(userLocation.accuracy);
    }
  }, [userLocation?.lat, userLocation?.lng, userLocation?.accuracy]);

  return <div ref={containerRef} className="absolute inset-0 z-0" />;
});
