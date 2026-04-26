import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Enums, Tables } from '../lib/database.types';
import { supabase } from '../lib/supabase';

type ActiveCommunityRequest = Pick<Tables<'community_requests'>, 'id' | 'status' | 'created_at' | 'name'> | null;
type AppRole = Enums<'app_role_type'>;

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

  const loadProfile = async (userId: string | null | undefined) => {
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

    setProfile(data ?? null);
    setCommunityId(
      data?.community_id ??
      session?.user?.user_metadata?.community_id ??
      session?.user?.app_metadata?.community_id ??
      null
    );
    setActiveCommunityRequest(nextActiveRequest);
  };

  const fetchSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      await loadProfile(session?.user?.id);
    } catch (error) {
      console.error('Error fetching session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      loadProfile(session?.user?.id).finally(() => {
        setIsLoading(false);
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const refreshSession = async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (data.session) {
      setSession(data.session);
      setUser(data.session.user);
      await loadProfile(data.session.user.id);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const rawRole = profile?.app_role ?? 'resident';
  const isPlatformAdmin = rawRole === 'admin' && !communityId;
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
