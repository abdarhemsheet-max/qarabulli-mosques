import { useEffect, useState } from 'react';

/**
 * checking    – reading the browser's permission state
 * granted     – location allowed
 * prompt      – not asked yet (browser will show its prompt on request)
 * denied      – user/browser blocked location for this site
 * unknown     – browser can't tell us (older Safari): ask on tap
 * unsupported – no geolocation at all (or page not on https)
 */
export type GeoPermission = 'checking' | 'granted' | 'prompt' | 'denied' | 'unknown' | 'unsupported';

function initialState(): GeoPermission {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return 'unsupported';
  if (typeof window !== 'undefined' && window.isSecureContext === false) return 'unsupported';
  return 'checking';
}

/**
 * Tracks the geolocation permission live (via the Permissions API when
 * available). The setter lets callers record what an actual position request
 * revealed on browsers that don't expose the permission state.
 */
export function useGeoPermission(): [GeoPermission, (next: GeoPermission) => void] {
  const [state, setState] = useState<GeoPermission>(initialState);

  useEffect(() => {
    if (state === 'unsupported') return;

    let cancelled = false;
    let status: PermissionStatus | null = null;
    const onChange = () => {
      if (!cancelled && status) setState(status.state as GeoPermission);
    };

    const permissions = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (!permissions?.query) {
      setState('unknown');
      return;
    }

    permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((res) => {
        if (cancelled) return;
        status = res;
        setState(res.state as GeoPermission);
        res.addEventListener('change', onChange);
      })
      .catch(() => {
        if (!cancelled) setState('unknown');
      });

    return () => {
      cancelled = true;
      status?.removeEventListener('change', onChange);
    };
  }, []); // run once on mount

  return [state, setState];
}

export interface BrowserEnv {
  isIOS: boolean;
  isAndroid: boolean;
  isInAppBrowser: boolean;
}

export function detectBrowserEnv(): BrowserEnv {
  if (typeof navigator === 'undefined') {
    return { isIOS: false, isAndroid: false, isInAppBrowser: false };
  }
  const ua = navigator.userAgent || '';
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
  const isAndroid = /Android/i.test(ua);
  const isInAppBrowser = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|Line\/|Twitter|Snapchat|TikTok|musical_ly|; wv\)/i.test(ua);
  return { isIOS, isAndroid, isInAppBrowser };
}
