import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Enums, Tables } from '../lib/database.types';
import { supabase } from '../lib/supabase';

type ActiveCommunityRequest = Pick<Tables<'community_requests'>, 'id' | 'status' | 'created_at' | 'name'> | null;
type AppRole = Enums<'app_role_type'>;
type FundsAccessStatus = {
  id: string;
  status: string;
  rejection_reason: string | null;
  decided_at: string | null;
} | null;
const PLATFORM_ADMIN_EMAIL = 'societyservicehub@gmail.com';

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
  const [myFundsAccessRequest, setMyFundsAccessRequest] = useState<FundsAccessStatus>(null);
  const [activeCommunityRequest, setActiveCommunityRequest] = useState<ActiveCommunityRequest>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isClearingRef = React.useRef(false);

  const resetAuthState = () => {
    setSession(null);
    setUser(null);
    setProfile(null);
    setCommunityId(null);
    setFundsEnabled(false);
    setBlocksEnabled(false);
    setBlockLabel('Block');
    setMyBlockId(null);
    setMyFundsAccessRequest(null);
    setActiveCommunityRequest(null);
  };

  const clearLocalSession = async () => {
    if (isClearingRef.current) return;
    isClearingRef.current = true;
    try {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => { });
    } finally {
      resetAuthState();
      isClearingRef.current = false;
    }
  };

  const loadProfile = async (userId: string | null | undefined, currentSession?: Session | null) => {
    if (!userId) {
      setProfile(null);
      setCommunityId(null);
      setFundsEnabled(false);
      setBlocksEnabled(false);
      setBlockLabel('Block');
      setMyBlockId(null);
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

    setProfile(profileData ?? null);
    setCommunityId(resolvedCommunityId);
    setMyBlockId(profileData?.block_id ?? null);
    setActiveCommunityRequest(nextActiveRequest);
    setIsLoading(false);

    if (!resolvedCommunityId || profileRole === 'admin') {
      setFundsEnabled(false);
      setBlocksEnabled(false);
      setBlockLabel('Block');
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
      supabase.rpc('get_funds_access_status', { p_community_id: resolvedCommunityId }),
    ]).then(([{ data: communityData, error: communityError }, { data: fundsRequestStatus, error: fundsStatusError }]) => {
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
    }).catch(err => {
      console.warn('Background community settings load warning:', err);
    });
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

      // getSession() only reads the locally cached JWT – it never contacts the
      // server. Validate that the user still exists server-side so that
      // deleted / banned users are signed out immediately on app launch.
      if (session?.user?.id) {
        const { error: userError } = await supabase.auth.getUser();
        if (userError) {
          console.warn('User no longer exists on server — signing out:', userError.message);
          await clearLocalSession();
          return;
        }
        await loadProfile(session.user.id, session);
      } else {
        resetAuthState();
      }

      setSession(session);
      setUser(session?.user ?? null);
    } catch (error) {
      console.error('Error fetching session:', error);
      resetAuthState();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();

    // Safety fallback: Ensure isLoading never remains stuck indefinitely on slow/offline starts
    const safetyTimer = setTimeout(() => {
      setIsLoading(false);
    }, 3500);

    // Re-verify session when mobile app resumes to foreground from background (Native only)
    let appStateSubscription: any = null;
    if (Platform.OS !== 'web') {
      appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === 'active') {
          fetchSession();
        }
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (event === 'SIGNED_OUT') {
        resetAuthState();
        setIsLoading(false);
        return;
      }

      if (!currentSession && event !== 'INITIAL_SESSION') {
        resetAuthState();
        setIsLoading(false);
        return;
      }

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user?.id) {
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
    if (error) {
      console.warn('Token refresh failed — falling back to current session:', error.message);
    }

    const refreshedSession = data.session ?? session;

    if (refreshedSession?.user?.id) {
      setSession(refreshedSession);
      setUser(refreshedSession.user);
      await loadProfile(refreshedSession.user.id, refreshedSession);
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
    await loadProfile(currentSession?.user?.id, currentSession);
  };

  const signOut = async () => {
    resetAuthState();
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Ignore local storage clear issues
    }

    supabase.auth.signOut().catch((err) => {
      console.warn('Background signout notification error:', err);
    });

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
