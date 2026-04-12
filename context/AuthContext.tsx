import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  communityId: string | null;
  isLoading: boolean;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  communityId: null,
  isLoading: true,
  refreshSession: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      setCommunityId(session?.user?.app_metadata?.community_id ?? null);
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
      setCommunityId(session?.user?.app_metadata?.community_id ?? null);
      setIsLoading(false);
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
      setCommunityId(data.session.user.app_metadata?.community_id ?? null);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, communityId, isLoading, refreshSession, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
