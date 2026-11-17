import { useCallback, useEffect, useRef, useState } from 'react';
import { useGeoPermission, type GeoPermission } from './geoPermission';

export interface UserPosition {
  lat: number;
  lng: number;
  accuracy: number;
}

export type LocationIssue = '' | 'gps-off' | 'weak';

/**
 * Single source of truth for the device location on the map:
 * - starts automatically only if permission is already granted
 * - otherwise `start()` must be called from a tap (browsers mute cold prompts)
 * - keeps watching so the blue dot follows the employee
 */
export function useUserLocation(): {
  permission: GeoPermission;
  position: UserPosition | null;
  locating: boolean;
  issue: LocationIssue;
  start: () => void;
} {
  const [permission, setPermission] = useGeoPermission();
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [locating, setLocating] = useState(false);
  const [issue, setIssue] = useState<LocationIssue>('');
  const watchRef = useRef<number | null>(null);

  const stop = () => {
    if (watchRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchRef.current);
    }
    watchRef.current = null;
  };

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPermission('unsupported');
      return;
    }
    setIssue('');
    setLocating(true);
    stop();
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPermission('granted');
        setLocating(false);
        setIssue(pos.coords.accuracy > 40 ? 'weak' : '');
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setPermission('denied');
          stop();
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setIssue('gps-off');
        } else {
          setIssue('weak');
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  }, [setPermission]);

  useEffect(() => {
    if (permission === 'granted' && watchRef.current === null) start();
  }, [permission, start]);

  useEffect(() => () => stop(), []);

  return { permission, position, locating, issue, start };
}
