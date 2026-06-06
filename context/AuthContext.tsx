import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';
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
  myBlockId: null,
  myFundsAccessRequest: null,
  activeCommunityRequest: null,
  isLoading: true,
  refreshSession: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Tables<'profiles'> | null>(null);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [fundsEnabled, setFundsEnabled] = useState(false);
  const [blocksEnabled, setBlocksEnabled] = useState(false);
  const [myBlockId, setMyBlockId] = useState<string | null>(null);
  const [myFundsAccessRequest, setMyFundsAccessRequest] = useState<FundsAccessStatus>(null);
  const [activeCommunityRequest, setActiveCommunityRequest] = useState<ActiveCommunityRequest>(null);
  const [isLoading, setIsLoading] = useState(true);

  const resetAuthState = () => {
    setSession(null);
    setUser(null);
    setProfile(null);
    setCommunityId(null);
    setFundsEnabled(false);
    setBlocksEnabled(false);
    setMyBlockId(null);
    setMyFundsAccessRequest(null);
    setActiveCommunityRequest(null);
  };

  const clearLocalSession = async () => {
    // Local scope clears persisted AsyncStorage tokens even when the refresh token
    // is stale or already revoked on the server.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    resetAuthState();
  };

  const loadProfile = async (userId: string | null | undefined, currentSession?: Session | null) => {
    if (!userId) {
      setProfile(null);
      setCommunityId(null);
      setFundsEnabled(false);
      setBlocksEnabled(false);
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
      setProfile(null);
      setFundsEnabled(false);
      setBlocksEnabled(false);
      setMyBlockId(null);
      setMyFundsAccessRequest(null);
      return;
    }

    let nextActiveRequest: ActiveCommunityRequest = null;

    if (!data?.community_id) {
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
    const profileRole = normalizeAppRole(data?.app_role, isKnownPlatformAdminEmail);
    const resolvedCommunityId =
      profileRole === 'admin' || isKnownPlatformAdminEmail
        ? null
        : data?.community_id ??
          effectiveSession?.user?.user_metadata?.community_id ??
          effectiveSession?.user?.app_metadata?.community_id ??
          null;

    setProfile(data ?? null);
    setCommunityId(resolvedCommunityId);
    setMyBlockId(data?.block_id ?? null);
    setActiveCommunityRequest(nextActiveRequest);

    if (!resolvedCommunityId || profileRole === 'admin') {
      setFundsEnabled(false);
      setBlocksEnabled(false);
      setMyFundsAccessRequest(null);
      return;
    }

    const [{ data: communityData, error: communityError }, { data: fundsRequestStatus, error: fundsStatusError }] = await Promise.all([
      supabase
        .from('communities')
        .select('funds_enabled, blocks_enabled')
        .eq('id', resolvedCommunityId)
        .maybeSingle(),
      supabase.rpc('get_funds_access_status', { p_community_id: resolvedCommunityId }),
    ]);

    if (communityError) {
      console.error('Error loading community activation status:', communityError);
      setFundsEnabled(false);
      setBlocksEnabled(false);
    } else {
      const enabledFunds = Boolean(communityData?.funds_enabled);
      setFundsEnabled(enabledFunds);
      setBlocksEnabled(enabledFunds && Boolean(communityData?.blocks_enabled));
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
      setSession(session);
      setUser(session?.user ?? null);
      await loadProfile(session?.user?.id, session);
    } catch (error) {
      console.error('Error fetching session:', error);
      // Treat any unexpected auth error as a sign-out to avoid a broken state.
      await clearLocalSession();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      loadProfile(session?.user?.id, session).finally(() => {
        setIsLoading(false);
      });
    });

    return () => {
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
    await supabase.auth.signOut();
    setProfile(null);
  };

  const isKnownPlatformAdminEmail =
    ((session?.user?.email ?? user?.email ?? '').trim().toLowerCase() === PLATFORM_ADMIN_EMAIL);
  const rawRole = normalizeAppRole(profile?.app_role, isKnownPlatformAdminEmail);
  // Platform admins must remain in the platform console even if the profile has stale/legacy community linkage.
  const isPlatformAdmin = rawRole === 'admin' || isKnownPlatformAdminEmail;
  const isCommunityLead = rawRole === 'community_lead' && !!communityId;

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
