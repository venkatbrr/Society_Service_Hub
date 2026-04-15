import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Tables } from '../lib/database.types';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Tables<'profiles'> | null;
  appRole: Tables<'profiles'>['app_role'];
  communityId: string | null;
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
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = async (userId: string | null | undefined) => {
    if (!userId) {
      setProfile(null);
      setCommunityId(null);
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

    setProfile(data ?? null);
    setCommunityId(
      data?.community_id ??
      session?.user?.user_metadata?.community_id ??
      session?.user?.app_metadata?.community_id ??
      null
    );
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

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        appRole: profile?.app_role ?? 'resident',
        communityId,
        isLoading,
        refreshSession,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
