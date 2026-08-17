import { isAuthRetryableFetchError, Session, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import {
  AuthSnapshot,
  clearAuthSnapshot,
  readAuthSnapshot,
  writeAuthSnapshot,
} from '../lib/authCache';
import { Enums, Tables } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { removeWebPushSubscription } from '../lib/webPush';


type ActiveCommunityRequest = Pick<Tables<'community_requests'>, 'id' | 'status' | 'created_at' | 'name'> | null;
type AppRole = Enums<'app_role_type'>;
type FundsAccessStatus = {
  id: string;
  status: string;
  rejection_reason: string | null;
  decided_at: string | null;
} | null;
const PLATFORM_ADMIN_EMAIL = 'thewooru@gmail.com';

function normalizeAppRole(role: AppRole | null | undefined, isKnownPlatformAdminEmail: boolean): AppRole {
  if (isKnownPlatformAdminEmail) {
    return 'admin';
  }

  return role ?? 'resident';
}

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Tables<'profiles'> | null;
  appRole: AppRole;
  communityId: string | null;
  isPlatformAdmin: boolean;
  isCommunityLead: boolean;
  fundsEnabled: boolean;
  blocksEnabled: boolean;
  blockLabel: string;
  myBlockId: string | null;
  flatId: string | null;
  /**
   * Whether this community has anyone in the president / vice-president seat.
   *
   * A community can exist without one — it is created from a join request
   * before anyone is appointed. Features that need a trusted signatory (funds,
   * fund roles, block-wise collection) stay closed until it is filled;
   * neighbourhood features (MCN, providers, visits, SOS) do not depend on it
   * and stay open. Loaded in the same non-blocking second phase as
   * `fundsEnabled`, so treat `false` on first render as "not known yet".
   */
  communityHasLead: boolean;
  isEventOrganizer: boolean;
  myFundsAccessRequest: FundsAccessStatus;
  activeCommunityRequest: ActiveCommunityRequest;
  isLoading: boolean;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  appRole: 'resident',
  communityId: null,
  isPlatformAdmin: false,
  isCommunityLead: false,
  fundsEnabled: false,
  blocksEnabled: false,
  blockLabel: 'Block',
  myBlockId: null,
  flatId: null,
  communityHasLead: false,
  isEventOrganizer: false,
  myFundsAccessRequest: null,
  activeCommunityRequest: null,
  isLoading: true,
  refreshSession: async () => { },
  signOut: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Tables<'profiles'> | null>(null);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [fundsEnabled, setFundsEnabled] = useState(false);
  const [blocksEnabled, setBlocksEnabled] = useState(false);
  const [blockLabel, setBlockLabel] = useState('Block');
  const [myBlockId, setMyBlockId] = useState<string | null>(null);
  const [flatId, setFlatId] = useState<string | null>(null);
  const [communityHasLead, setCommunityHasLead] = useState(false);
  const [isEventOrganizer, setIsEventOrganizer] = useState(false);
  const [myFundsAccessRequest, setMyFundsAccessRequest] = useState<FundsAccessStatus>(null);
  const [activeCommunityRequest, setActiveCommunityRequest] = useState<ActiveCommunityRequest>(null);
  const [isLoading, setIsLoading] = useState(true);

  const sessionRef = React.useRef<Session | null>(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const isClearingRef = React.useRef(false);

  /**
   * Bumped whenever the local session is torn down. `loadProfile` captures it
   * on entry and drops its writes if it changed mid-flight, so a slow profile
   * read cannot repopulate state for a user who has just been signed out.
   */
  const authGenerationRef = React.useRef(0);

  /**
   * In-flight `loadProfile` per user id. `fetchSession()` and the
   * `INITIAL_SESSION` auth event both want the profile on launch; without this
   * they each fired their own `profiles` read and raced each other.
   */
  const profileLoadRef = React.useRef<{ userId: string; promise: Promise<void> } | null>(null);

  /**
   * Monotonic per-load id. Only the most recently *started* load may write —
   * otherwise an in-flight read issued before, say, joining a community could
   * land after the forced refresh and put the pre-join answer back on screen.
   */
  const profileLoadSeqRef = React.useRef(0);

  const applySnapshot = (snapshot: AuthSnapshot) => {
    setProfile(snapshot.profile);
    setCommunityId(snapshot.communityId);
    setMyBlockId(snapshot.myBlockId);
    setFlatId(snapshot.flatId);
    setFundsEnabled(snapshot.fundsEnabled);
    setBlocksEnabled(snapshot.blocksEnabled);
    setBlockLabel(snapshot.blockLabel);
    setCommunityHasLead(snapshot.communityHasLead);
    setIsEventOrganizer(snapshot.isEventOrganizer);
  };

  // Mirrors whatever the last successful load resolved, so the snapshot written
  // after the background community queries still carries the profile-phase values.
  const snapshotRef = React.useRef<Omit<AuthSnapshot, 'version'> | null>(null);

  const persistSnapshot = (patch: Partial<Omit<AuthSnapshot, 'version'>>) => {
    if (!snapshotRef.current) return;
    snapshotRef.current = { ...snapshotRef.current, ...patch };
    writeAuthSnapshot(snapshotRef.current);
  };

  const resetAuthState = () => {
    setSession(null);
    setUser(null);
    setProfile(null);
    setCommunityId(null);
    setFundsEnabled(false);
    setBlocksEnabled(false);
    setBlockLabel('Block');
    setMyBlockId(null);
    setFlatId(null);
    setCommunityHasLead(false);
    setIsEventOrganizer(false);
    setMyFundsAccessRequest(null);
    setActiveCommunityRequest(null);
  };

  const clearLocalSession = async () => {
    if (isClearingRef.current) return;
    isClearingRef.current = true;
    authGenerationRef.current += 1;
    snapshotRef.current = null;
    clearAuthSnapshot();
    try {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => { });
    } finally {
      resetAuthState();
      isClearingRef.current = false;
    }
  };

  /**
   * `force: true` bypasses the in-flight dedupe — use it after a write that the
   * profile must reflect (joining a community, picking a flat, editing the
   * profile). Everything else should share the launch load.
   */
  const loadProfile = (
    userId: string | null | undefined,
    currentSession?: Session | null,
    options?: { force?: boolean }
  ): Promise<void> => {
    if (!userId) return loadProfileUncached(userId, currentSession);

    const inFlight = profileLoadRef.current;
    if (!options?.force && inFlight && inFlight.userId === userId) return inFlight.promise;

    const promise = loadProfileUncached(userId, currentSession).finally(() => {
      if (profileLoadRef.current?.promise === promise) {
        profileLoadRef.current = null;
      }
    });
    profileLoadRef.current = { userId, promise };
    return promise;
  };

  const loadProfileUncached = async (userId: string | null | undefined, currentSession?: Session | null) => {
    const generation = authGenerationRef.current;
    const seq = ++profileLoadSeqRef.current;
    const isStale = () =>
      authGenerationRef.current !== generation || profileLoadSeqRef.current !== seq;

    if (!userId) {
      setProfile(null);
      setCommunityId(null);
      setFundsEnabled(false);
      setBlocksEnabled(false);
      setBlockLabel('Block');
      setMyBlockId(null);
      setIsEventOrganizer(false);
      setMyFundsAccessRequest(null);
      setActiveCommunityRequest(null);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error loading profile:', error);
      // On network errors / server issues, retain existing profile if already loaded
      // to prevent kicking user to /community-select.
      return;
    }

    let profileData = data;

    if (!profileData) {
      const effectiveSession = currentSession ?? session;
      if (effectiveSession?.user) {
        console.warn('Profile row missing for authenticated user. Attempting self-healing recreation...');
        const email = effectiveSession.user.email || '';
        const nameFallback = email ? email.split('@')[0] : 'Resident';
        const fullName = effectiveSession.user.user_metadata?.full_name ||
          effectiveSession.user.user_metadata?.name ||
          nameFallback;
        const avatarUrl = effectiveSession.user.user_metadata?.avatar_url ||
          effectiveSession.user.user_metadata?.picture ||
          null;
        const appRole = email.trim().toLowerCase() === PLATFORM_ADMIN_EMAIL ? 'admin' : 'resident';

        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            full_name: fullName,
            avatar_url: avatarUrl,
            email: email,
            app_role: appRole
          })
          .select('*')
          .maybeSingle();

        if (insertError) {
          console.error('Failed to self-heal/recreate missing profile:', insertError);
          await clearLocalSession();
          return;
        }

        profileData = newProfile;
      }
    }

    let nextActiveRequest: ActiveCommunityRequest = null;

    // Profile row was deleted from the database but the Auth session is still valid.
    // Clear everything locally so the root layout redirects to /login.
    if (!profileData) {
      await clearLocalSession();
      return;
    }

    if (!profileData?.community_id) {
      const { data: requestData, error: requestError } = await supabase
        .from('community_requests')
        .select('id, status, created_at, name')
        .eq('requested_by', userId)
        .in('status', ['pending', 'needs_info', 'rejected'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (requestError) {
        console.error('Error loading active community request:', requestError);
      } else {
        nextActiveRequest = requestData ?? null;
      }
    }

    const effectiveSession = currentSession ?? session;
    const isKnownPlatformAdminEmail =
      (effectiveSession?.user?.email ?? '').trim().toLowerCase() === PLATFORM_ADMIN_EMAIL;
    const profileRole = normalizeAppRole(profileData?.app_role, isKnownPlatformAdminEmail);
    const resolvedCommunityId =
      profileRole === 'admin' || isKnownPlatformAdminEmail
        ? null
        : profileData?.community_id ??
        effectiveSession?.user?.user_metadata?.community_id ??
        effectiveSession?.user?.app_metadata?.community_id ??
        null;

    if (isStale()) return;

    setProfile(profileData ?? null);
    setCommunityId(resolvedCommunityId);
    setMyBlockId(profileData?.block_id ?? null);
    setFlatId((profileData as any)?.flat_id ?? null);
    setActiveCommunityRequest(nextActiveRequest);
    setIsLoading(false);

    // Seed the warm-start snapshot with everything the profile phase resolved.
    // The second-phase flags below patch onto it as they land — see persistSnapshot.
    //
    // Those flags carry over from the previous snapshot for the same user and
    // community rather than resetting to their defaults: this phase simply does
    // not know them yet, and writing `fundsEnabled: false` here would mean an
    // app closed between the two phases persists a snapshot that hides funds on
    // the next warm start. A community change drops them, since they are
    // community-scoped and the old answers no longer apply.
    const previous = snapshotRef.current;
    const carryOver =
      previous && previous.userId === userId && previous.communityId === resolvedCommunityId
        ? previous
        : null;

    snapshotRef.current = {
      userId,
      profile: profileData,
      communityId: resolvedCommunityId,
      myBlockId: profileData?.block_id ?? null,
      flatId: (profileData as any)?.flat_id ?? null,
      fundsEnabled: carryOver?.fundsEnabled ?? false,
      blocksEnabled: carryOver?.blocksEnabled ?? false,
      blockLabel: carryOver?.blockLabel ?? 'Block',
      communityHasLead: carryOver?.communityHasLead ?? false,
      isEventOrganizer: carryOver?.isEventOrganizer ?? false,
    };
    writeAuthSnapshot(snapshotRef.current);

    if (!resolvedCommunityId || profileRole === 'admin') {
      setFundsEnabled(false);
      setBlocksEnabled(false);
      setBlockLabel('Block');
      setCommunityHasLead(false);
      setIsEventOrganizer(false);
      setMyFundsAccessRequest(null);
      return;
    }

    // Secondary background queries: load community settings and funds access status non-blockingly
    Promise.all([
      supabase
        .from('communities')
        .select('funds_enabled, blocks_enabled, block_label')
        .eq('id', resolvedCommunityId)
        .maybeSingle(),
      supabase.rpc('get_funds_access_status'),
      supabase
        .from('community_event_organizers')
        .select('id')
        .eq('community_id', resolvedCommunityId)
        .eq('user_id', userId)
        .maybeSingle(),
      // head+count: we only need "is the seat filled", never the rows.
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('community_id', resolvedCommunityId)
        .in('app_role', ['president', 'vice_president'])
        .is('removed_at', null),
    ]).then(([{ data: communityData, error: communityError }, { data: fundsRequestStatus, error: fundsStatusError }, { data: organizerRow, error: organizerError }, { count: leadCount, error: leadError }]) => {
      if (isStale()) return;

      if (communityError) {
        console.error('Error loading community activation status:', communityError);
        setFundsEnabled(false);
        setBlocksEnabled(false);
        setBlockLabel('Block');
      } else {
        const enabledFunds = Boolean(communityData?.funds_enabled);
        setFundsEnabled(enabledFunds);
        setBlocksEnabled(Boolean(communityData?.blocks_enabled));
        setBlockLabel((communityData as any)?.block_label ?? 'Block');
        persistSnapshot({
          fundsEnabled: enabledFunds,
          blocksEnabled: Boolean(communityData?.blocks_enabled),
          blockLabel: (communityData as any)?.block_label ?? 'Block',
        });
      }

      if (fundsStatusError) {
        console.error('Error loading funds access status:', fundsStatusError);
        setMyFundsAccessRequest(null);
      } else {
        const latest = (fundsRequestStatus ?? [])[0] ?? null;
        setMyFundsAccessRequest(
          latest
            ? {
              id: latest.request_id,
              status: latest.status,
              rejection_reason: latest.rejection_reason,
              decided_at: latest.decided_at,
            }
            : null
        );
      }

      if (organizerError) {
        console.error('Error loading events coordinator grant:', organizerError);
        setIsEventOrganizer(false);
      } else {
        setIsEventOrganizer(!!organizerRow);
        persistSnapshot({ isEventOrganizer: !!organizerRow });
      }

      if (leadError) {
        // Fail open: a lookup failure must not make an established community
        // look leaderless and hide its funds behind a "no president" notice.
        console.error('Error loading community leadership status:', leadError);
        setCommunityHasLead(true);
      } else {
        setCommunityHasLead((leadCount ?? 0) > 0);
        persistSnapshot({ communityHasLead: (leadCount ?? 0) > 0 });
      }
    }).catch(err => {
      console.warn('Background community settings load warning:', err);
    });
  };

  /**
   * `getSession()` only reads the locally cached JWT — it never contacts the
   * server — so this confirms the user still exists server-side and signs out
   * deleted / banned accounts. It runs *alongside* the profile load rather than
   * in front of it: they are independent round trips, and serialising them put
   * a whole extra RTT between launch and first paint.
   */
  const validateUserServerSide = async () => {
    const { error: userError } = await supabase.auth.getUser();
    if (!userError) return;

    if (isAuthRetryableFetchError(userError)) {
      console.warn('Could not reach auth server; keeping cached session:', userError.message);
      return;
    }

    console.warn('User no longer exists on server — signing out:', userError.message);
    await clearLocalSession();
  };

  const fetchSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        // Stale or invalid token (e.g. emulator wipe, server-side revocation).
        // Clear local state so the user lands on the login screen cleanly.
        console.warn('Session error — signing out:', error.message);
        await clearLocalSession();
        return;
      }

      if (!session?.user?.id) {
        resetAuthState();
        setSession(null);
        setUser(null);
        clearAuthSnapshot();
        return;
      }

      setSession(session);
      setUser(session.user);

      // Both round trips start before anything is awaited — the profile read and
      // the server-side session check are independent, and running them in series
      // put a whole extra RTT between launch and first paint.
      const profileLoad = loadProfile(session.user.id, session);
      const validation = validateUserServerSide();

      // Warm start: paint the previous launch's resolved state immediately and
      // let the load above revalidate behind it, instead of holding the splash
      // for an answer that almost never changed. See lib/authCache.ts.
      // Skipped if the real load has already landed (snapshotRef is set on
      // success) — stale must never overwrite fresh.
      const snapshot = await readAuthSnapshot();
      if (!snapshotRef.current && snapshot && snapshot.userId === session.user.id) {
        snapshotRef.current = snapshot;
        applySnapshot(snapshot);
        setIsLoading(false);
      }

      await Promise.all([profileLoad, validation]);
    } catch (error) {
      console.error('Error fetching session:', error);
      resetAuthState();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();

    // Safety fallback: isLoading must never stick on a slow/offline start.
    // Unconditional on purpose — the old `if (!sessionRef.current)` guard meant
    // the one case that actually wedges the splash (a session present but its
    // profile read hanging) was the one case the timer refused to release.
    const safetyTimer = setTimeout(() => setIsLoading(false), 6000);

    // Re-verify session when mobile app resumes to foreground from background (Native only)
    let appStateSubscription: any = null;
    if (Platform.OS !== 'web') {
      appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === 'active') {
          supabase.auth.startAutoRefresh();
          const uid = sessionRef.current?.user?.id;
          if (uid) void loadProfile(uid, sessionRef.current);
        } else {
          supabase.auth.stopAutoRefresh();
        }
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (event === 'SIGNED_OUT') {
        authGenerationRef.current += 1;
        snapshotRef.current = null;
        clearAuthSnapshot();
        resetAuthState();
        setIsLoading(false);
        return;
      }

      if (!currentSession && event !== 'INITIAL_SESSION') {
        authGenerationRef.current += 1;
        snapshotRef.current = null;
        clearAuthSnapshot();
        resetAuthState();
        setIsLoading(false);
        return;
      }

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      // A token refresh changes the JWT, nothing about the profile. Re-reading
      // it here cost a `profiles` round trip roughly every hour and re-ran every
      // consumer's community query for an identical result.
      if (event === 'TOKEN_REFRESHED') return;

      if (currentSession?.user?.id) {
        // Deduped against the launch load in fetchSession — INITIAL_SESSION
        // fires while that one is still in flight and used to double-fetch.
        loadProfile(currentSession.user.id, currentSession).catch((err) => {
          console.warn('Profile hydration warning:', err);
        });
      } else {
        resetAuthState();
        setIsLoading(false);
      }
    });

    return () => {
      clearTimeout(safetyTimer);
      appStateSubscription?.remove();
      subscription.unsubscribe();
    };
  }, []);

  const refreshSession = async () => {
    const { data, error } = await supabase.auth.refreshSession();

    if (error && !isAuthRetryableFetchError(error)) {
      console.warn('Refresh token rejected — signing out:', error.message);
      await clearLocalSession();
      Toast.show({
        type: 'error',
        text1: 'Session expired',
        text2: 'Please sign in again.',
        visibilityTime: 6000,
      });
      return;
    }
    if (error) {
      console.warn('Token refresh unreachable — keeping current session:', error.message);
    }

    const refreshedSession = data.session ?? session;

    if (refreshedSession?.user?.id) {
      setSession(refreshedSession);
      setUser(refreshedSession.user);
      await loadProfile(refreshedSession.user.id, refreshedSession, { force: true });
      return;
    }

    const {
      data: { session: currentSession },
      error: getSessionError,
    } = await supabase.auth.getSession();

    if (getSessionError) {
      console.warn('Session reload failed — signing out:', getSessionError.message);
      await clearLocalSession();
      return;
    }

    setSession(currentSession);
    setUser(currentSession?.user ?? null);
    await loadProfile(currentSession?.user?.id, currentSession, { force: true });
  };

  const clearPushTokenForCurrentUser = async () => {
    const uid = session?.user?.id;
    if (!uid || Platform.OS === 'web') return;
    const { error } = await supabase
      .from('profiles')
      .update({ expo_push_token: null })
      .eq('id', uid);
    if (error) console.warn('Could not clear push token on sign-out:', error.message);
  };

  const signOut = async () => {
    await Promise.all([
      clearPushTokenForCurrentUser(),
      removeWebPushSubscription(),
    ]);

    authGenerationRef.current += 1;

    snapshotRef.current = null;
    clearAuthSnapshot();

    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Server sign-out failed; clearing locally anyway:', err);
    }

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* storage clear best effort */
    }

    resetAuthState();

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  const isKnownPlatformAdminEmail =
    ((session?.user?.email ?? user?.email ?? '').trim().toLowerCase() === PLATFORM_ADMIN_EMAIL);
  const rawRole = normalizeAppRole(profile?.app_role, isKnownPlatformAdminEmail);
  // Platform admins must remain in the platform console even if the profile has stale/legacy community linkage.
  const isPlatformAdmin = rawRole === 'admin' || isKnownPlatformAdminEmail;
  const isCommunityLead = (rawRole === 'president' || rawRole === 'vice_president') && !!communityId;

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        appRole: rawRole,
        communityId,
        isPlatformAdmin,
        isCommunityLead,
        fundsEnabled,
        blocksEnabled,
        blockLabel,
        myBlockId,
        flatId,
        communityHasLead,
        isEventOrganizer,
        myFundsAccessRequest,
        activeCommunityRequest,
        isLoading,
        refreshSession,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
