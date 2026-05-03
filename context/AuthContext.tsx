import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Enums, Tables } from '../lib/database.types';
import { supabase } from '../lib/supabase';

type ActiveCommunityRequest = Pick<Tables<'community_requests'>, 'id' | 'status' | 'created_at' | 'name'> | null;
type AppRole = Enums<'app_role_type'>;
const PLATFORM_ADMIN_EMAIL = 'societyservicehub@gmail.com';

function normalizeAppRole(role: AppRole | null | undefined, isKnownPlatformAdminEmail: boolean): AppRole {
  if (isKnownPlatformAdminEmail) {
    return 'admin';
  }

  // Backward-compatibility: first users that were auto-promoted previously
  // must be treated as residents in the app.
  if (role === 'community_lead') {
    return 'resident';
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
  const [activeCommunityRequest, setActiveCommunityRequest] = useState<ActiveCommunityRequest>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = async (userId: string | null | undefined, currentSession?: Session | null) => {
    if (!userId) {
      setProfile(null);
      setCommunityId(null);
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
    setActiveCommunityRequest(nextActiveRequest);
  };

  const fetchSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        // Stale or invalid token (e.g. emulator wipe, server-side revocation).
        // Clear local state so the user lands on the login screen cleanly.
        console.warn('Session error — signing out:', error.message);
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        setCommunityId(null);
        setActiveCommunityRequest(null);
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      await loadProfile(session?.user?.id, session);
    } catch (error) {
      console.error('Error fetching session:', error);
      // Treat any unexpected auth error as a sign-out to avoid a broken state.
      await supabase.auth.signOut().catch(() => {});
      setSession(null);
      setUser(null);
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
      console.warn('Token refresh failed — signing out:', error.message);
      await supabase.auth.signOut().catch(() => {});
      setSession(null);
      setUser(null);
      setProfile(null);
      setCommunityId(null);
      return;
    }
    if (data.session) {
      setSession(data.session);
      setUser(data.session.user);
      await loadProfile(data.session.user.id, data.session);
    }
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
