import { useCallback, useEffect, useMemo, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { BottomNav } from './components/BottomNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HeaderBar } from './components/HeaderBar';
import {
  fetchOrBootstrapUserProfile,
  getCurrentStaffUser,
  initWorkspaceTokenWatcher,
  onStaffAuthChange,
  signOutStaff,
  type StaffUser,
} from './lib/supabase/auth';
import { subscribeMosques } from './lib/supabase/mosques';
import { DEFAULT_OSM_SETTINGS, subscribeOsmSettings } from './lib/supabase/settings';
import { subscribeGoogleSheetsConfig } from './lib/supabase/sheetsConfig';
import { fetchQarabulliOsmMosques } from './lib/utils/osmMosques';
import { haversineDistanceMeters } from './lib/utils/geo';
import { AddMosquePage } from './pages/AddMosquePage';
import { LoginPage } from './pages/LoginPage';
import { MosquesListPage } from './pages/MosquesListPage';
import { UsersPage } from './pages/UsersPage';
import type {
  ActiveTab,
  GoogleMosqueCandidate,
  GoogleSheetsConfig,
  MosqueRecord,
  OsmMosqueCandidate,
  OsmSettings,
  UserProfile,
} from './types/mosque';

const GOOGLE_MAPS_API_KEY = (
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
)?.trim() ?? '';

function MainApp() {
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<StaffUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authBanner, setAuthBanner] = useState<{
    type: 'verify-email' | 'no-profile';
    email?: string | null;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('add');
  const [mosques, setMosques] = useState<MosqueRecord[]>([]);
  const [rawGoogleMosques, setRawGoogleMosques] = useState<GoogleMosqueCandidate[]>([]);
  const [rawOsmMosques, setRawOsmMosques] = useState<OsmMosqueCandidate[]>([]);
  const [osmSettings, setOsmSettings] = useState<OsmSettings>(DEFAULT_OSM_SETTINGS);
  const [sheetConfig, setSheetConfig] = useState<GoogleSheetsConfig | null>(null);
  const [mosquesLoading, setMosquesLoading] = useState(true);
  const [editingMosque, setEditingMosque] = useState<MosqueRecord | null>(null);
  const [firestoreError, setFirestoreError] = useState<Error | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Track browser online/offline state
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Top-level Case A quota listener (persists across child unmounts)
  useEffect(() => {
    const handleQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  const mergeGoogleMosques = useCallback((incoming: GoogleMosqueCandidate[]) => {
    if (incoming.length === 0) return;
    setRawGoogleMosques((prev) => {
      const seen = new Set(prev.map((p) => p.placeId));
      const next = [...prev];
      for (const item of incoming) {
        if (!seen.has(item.placeId)) {
          seen.add(item.placeId);
          next.push(item);
        }
      }
      return next;
    });
  }, []);

  const loadUserProfile = useCallback(async (user: StaffUser) => {
    const { profile, needsVerificationForBootstrap } =
      await fetchOrBootstrapUserProfile(user);

    if (profile) {
      setUserProfile(profile);
      setAuthBanner(null);
    } else if (needsVerificationForBootstrap) {
      setUserProfile(null);
      setAuthBanner({ type: 'verify-email', email: user.email });
    } else {
      setUserProfile(null);
      setAuthBanner({ type: 'no-profile', email: user.email });
    }
  }, []);

  // Clear in-memory Google Workspace OAuth token on sign-out
  useEffect(() => {
    return initWorkspaceTokenWatcher();
  }, []);

  // Listen to Supabase Auth state
  useEffect(() => {
    const unsub = onStaffAuthChange(async (user) => {
      setAuthUser(user);
      if (user) {
        try {
          await loadUserProfile(user);
        } catch (err) {
          setFirestoreError(err instanceof Error ? err : new Error(String(err)));
        }
      } else {
        setUserProfile(null);
        setAuthBanner(null);
        setMosques([]);
        setSheetConfig(null);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, [loadUserProfile]);

  // Subscribe to mosques and load cached/live OSM mosques when authenticated
  useEffect(() => {
    if (!authReady || !userProfile) {
      setMosquesLoading(false);
      return;
    }

    setMosquesLoading(true);
    const unsub = subscribeMosques(
      (list) => {
        setMosques(list);
        setMosquesLoading(false);
      },
      (err) => {
        setMosquesLoading(false);
        setFirestoreError(err);
      }
    );

    const unsubSettings = subscribeOsmSettings((settings) => {
      setOsmSettings(settings);
    });

    const unsubSheetsConfig = subscribeGoogleSheetsConfig((cfg) => {
      setSheetConfig(cfg);
    });

    void fetchQarabulliOsmMosques().then((items) => {
      setRawOsmMosques(items);
    });

    return () => {
      unsub();
      unsubSettings();
      unsubSheetsConfig();
    };
  }, [authReady, userProfile]);

  // Hide red Google Maps pins once linked via googlePlaceId or documented within 35m
  const unverifiedGoogleCandidates = useMemo(
    () =>
      rawGoogleMosques.filter(
        (cand) =>
          !mosques.some(
            (m) =>
              (Boolean(m.googlePlaceId) && m.googlePlaceId === cand.placeId) ||
              haversineDistanceMeters(cand.lat, cand.lng, m.lat, m.lng) <= 35
          )
      ),
    [rawGoogleMosques, mosques]
  );

  // Hide gray OSM pins once linked via osmId or documented within 35m
  const unverifiedOsmCandidates = useMemo(
    () =>
      rawOsmMosques.filter(
        (cand) =>
          !mosques.some(
            (m) =>
              (Boolean(m.osmId) && m.osmId === cand.osmId) ||
              haversineDistanceMeters(cand.lat, cand.lng, m.lat, m.lng) <= 35
          )
      ),
    [rawOsmMosques, mosques]
  );

  if (firestoreError) {
    throw firestoreError;
  }

  const pendingCount = useMemo(
    () => mosques.filter((m) => m.hasPendingWrites).length,
    [mosques]
  );

  const handleRefreshProfile = async () => {
    if (!authUser) return;
    const current = await getCurrentStaffUser();
    if (current) {
      await loadUserProfile(current);
    }
  };

  const handleEditMosque = (mosque: MosqueRecord) => {
    setEditingMosque(mosque);
    setActiveTab('add');
  };

  const quotaBanner = quotaExceeded ? (
    <div
      className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm"
      dir="ltr"
    >
      <span>
        Google Maps Platform quota reached. If you are the app owner, visit{' '}
        <a
          href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-semibold text-amber-950 hover:text-amber-800"
        >
          maps developer site
        </a>{' '}
        for instructions to update your account.
      </span>
    </div>
  ) : null;

  let content: React.ReactNode;

  if (!authReady) {
    content = (
      <div className="min-h-screen bg-[#FAF8F4] flex items-center justify-center p-6">
        <p className="text-sm font-semibold text-[#0F4C3A]">جاري التحقق من الجلسة...</p>
      </div>
    );
  } else if (!authUser || !userProfile) {
    content = (
      <LoginPage
        authBanner={authBanner}
        onRefreshProfile={handleRefreshProfile}
      />
    );
  } else {
    const hasGoogleKey = Boolean(GOOGLE_MAPS_API_KEY);
    content = (
      <div className="min-h-[100dvh] bg-[#FAF8F4] flex flex-col">
        {quotaBanner}

        <HeaderBar
          user={userProfile}
          isOnline={isOnline}
          pendingCount={pendingCount}
          activeTab={activeTab}
          onSelectTab={(tab) => {
            if (tab !== 'add') setEditingMosque(null);
            setActiveTab(tab);
          }}
          onSignOut={() => void signOutStaff()}
        />

        <main className="flex-1 flex flex-col">
          {activeTab === 'add' && (
            <AddMosquePage
              mosques={mosques}
              googleCandidates={unverifiedGoogleCandidates}
              osmCandidates={unverifiedOsmCandidates}
              hasGoogleKey={hasGoogleKey}
              onMergeGoogleCandidates={mergeGoogleMosques}
              currentUser={userProfile}
              osmSettings={osmSettings}
              editingMosque={editingMosque}
              onClearEditing={() => setEditingMosque(null)}
              onSelectExistingForEdit={(existing) => setEditingMosque(existing)}
            />
          )}

          {activeTab === 'list' && (
            <MosquesListPage
              mosques={mosques}
              currentUser={userProfile}
              osmSettings={osmSettings}
              sheetConfig={sheetConfig}
              loading={mosquesLoading}
              onEditMosque={handleEditMosque}
            />
          )}

          {activeTab === 'users' && (
            <UsersPage currentUser={userProfile} osmSettings={osmSettings} />
          )}
        </main>

        <BottomNav
          activeTab={activeTab}
          onSelectTab={(tab) => {
            if (tab !== 'add') setEditingMosque(null);
            setActiveTab(tab);
          }}
        />
      </div>
    );
  }

  if (GOOGLE_MAPS_API_KEY) {
    return (
      <APIProvider
        apiKey={GOOGLE_MAPS_API_KEY}
        language="ar"
        region="LY"
        libraries={['places', 'marker', 'geometry']}
      >
        {content}
      </APIProvider>
    );
  }

  return (
    <>
      {quotaBanner}
      {content}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
