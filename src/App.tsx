import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { BottomNav } from './components/BottomNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  fetchOrBootstrapUserProfile,
  onStaffAuthChange,
  signOutStaff,
  type StaffUser,
} from './lib/supabase/auth';
import { subscribeMosques } from './lib/supabase/mosques';
import { DEFAULT_OSM_SETTINGS, subscribeOsmSettings } from './lib/supabase/settings';
import { loadQarabulliOsmMosques } from './lib/utils/osmMosques';
import { haversineDistanceMeters } from './lib/utils/geo';
import { DEMO_MOSQUES, DEMO_USER, isDemoMode } from './lib/demo';
import { LoginPage } from './pages/LoginPage';
import { MapPage, type MapFocusRequest } from './pages/MapPage';
import { ListPage } from './pages/ListPage';
import { AdminPage } from './pages/AdminPage';
import type { ActiveTab, MosqueRecord, OsmMosqueCandidate, OsmSettings, UserProfile } from './types/mosque';

const TAB_TITLES: Record<ActiveTab, string> = {
  map: 'توثيق المساجد',
  list: 'المساجد الموثّقة',
  admin: 'لوحة الإدارة',
};

function MainApp() {
  const [authReady, setAuthReady] = useState(isDemoMode);
  const [authUser, setAuthUser] = useState<StaffUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(isDemoMode ? DEMO_USER : null);
  const [authBanner, setAuthBanner] = useState<{ type: 'no-profile'; email?: string | null } | null>(null);

  const [tab, setTab] = useState<ActiveTab>('map');
  const [mosques, setMosques] = useState<MosqueRecord[]>(isDemoMode ? DEMO_MOSQUES : []);
  const [rawOsm, setRawOsm] = useState<OsmMosqueCandidate[]>([]);
  const [osmSettings, setOsmSettings] = useState<OsmSettings>(DEFAULT_OSM_SETTINGS);
  const [loading, setLoading] = useState(!isDemoMode);
  const [fatal, setFatal] = useState<Error | null>(null);
  const [mapFocus, setMapFocus] = useState<MapFocusRequest | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const loadProfile = useCallback(async (user: StaffUser) => {
    const { profile: p } = await fetchOrBootstrapUserProfile(user);
    setProfile(p);
    setAuthBanner(p ? null : { type: 'no-profile', email: user.email });
  }, []);

  useEffect(() => {
    if (isDemoMode) return;
    return onStaffAuthChange(async (user) => {
      setAuthUser(user);
      if (user) {
        try {
          await loadProfile(user);
        } catch (err) {
          setFatal(err instanceof Error ? err : new Error(String(err)));
        }
      } else {
        setProfile(null);
        setAuthBanner(null);
        setMosques([]);
        setTab('map');
      }
      setAuthReady(true);
    });
  }, [loadProfile]);

  // Load the OpenStreetMap layer as soon as someone is signed in
  useEffect(() => {
    if (!profile) return;
    void loadQarabulliOsmMosques(setRawOsm);
  }, [profile?.uid]);

  useEffect(() => {
    if (isDemoMode || !profile) return;
    setLoading(true);
    const unsubMosques = subscribeMosques(
      (list) => {
        setMosques(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        setFatal(err);
      }
    );
    const unsubSettings = subscribeOsmSettings(setOsmSettings);
    return () => {
      unsubMosques();
      unsubSettings();
    };
  }, [profile?.uid]);

  // Hide grey OSM pins that are already documented (linked by ID or within 35 m)
  const osmCandidates = useMemo(
    () =>
      rawOsm.filter(
        (c) =>
          !mosques.some(
            (m) => (m.osmId && m.osmId === c.osmId) || haversineDistanceMeters(c.lat, c.lng, m.lat, m.lng) <= 35
          )
      ),
    [rawOsm, mosques]
  );

  if (fatal) throw fatal;

  if (!authReady) {
    return (
      <div className="min-h-[100dvh] bg-brand flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-white/20 border-t-gold animate-spin" />
      </div>
    );
  }

  if (!profile || (!isDemoMode && !authUser)) {
    return <LoginPage authBanner={authBanner} />;
  }

  const isAdmin = profile.role === 'admin';
  const activeTab: ActiveTab = tab === 'admin' && !isAdmin ? 'map' : tab;

  return (
    <div className="h-[100dvh] flex flex-col bg-sand overflow-hidden">
      <AppHeader user={profile} title={TAB_TITLES[activeTab]} isOnline={isOnline} onSignOut={() => void signOutStaff()} />

      <main className="relative flex-1 min-h-0">
        {/* Keep the map mounted so it doesn't reload when switching tabs */}
        <div className={activeTab === 'map' ? 'absolute inset-0' : 'hidden'}>
          <MapPage
            mosques={mosques}
            osmCandidates={osmCandidates}
            currentUser={profile}
            osmSettings={osmSettings}
            focus={mapFocus}
          />
        </div>
        {activeTab === 'list' && (
          <ListPage
            mosques={mosques}
            currentUser={profile}
            osmSettings={osmSettings}
            loading={loading}
            onShowOnMap={(m) => {
              setMapFocus({ lat: m.lat, lng: m.lng, mosqueId: m.id, nonce: Date.now() });
              setTab('map');
            }}
          />
        )}
        {activeTab === 'admin' && isAdmin && (
          <AdminPage mosques={mosques} currentUser={profile} osmSettings={osmSettings} />
        )}
      </main>

      <BottomNav activeTab={activeTab} isAdmin={isAdmin} onSelectTab={setTab} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
