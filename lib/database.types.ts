export type Database = {
  public: {
    Tables: {
      communities: {
        Row: {
          id: string;
          name: string;
          code: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          code?: string;
          created_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          community_id: string | null;
          app_role: 'admin' | 'resident';
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          community_id?: string | null;
          app_role?: 'admin' | 'resident';
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          community_id?: string | null;
          app_role?: 'admin' | 'resident';
          created_at?: string;
        };
      };
      service_providers: {
        Row: {
          id: string;
          community_id: string;
          created_by: string;
          name: string;
          phone: string;
          category: string;
          description: string | null;
          flat_block: string | null;
          avg_rating: number;
          rating_count: number;
          is_verified: boolean;
          is_trending: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          community_id: string;
          created_by: string;
          name: string;
          phone: string;
          category: string;
          description?: string | null;
          flat_block?: string | null;
          avg_rating?: number;
          rating_count?: number;
          is_verified?: boolean;
          is_trending?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          community_id?: string;
          created_by?: string;
          name?: string;
          phone?: string;
          category?: string;
          description?: string | null;
          flat_block?: string | null;
          avg_rating?: number;
          rating_count?: number;
          is_verified?: boolean;
          is_trending?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      favorites: {
        Row: {
          id: string;
          user_id: string;
          provider_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider_id?: string;
          created_at?: string;
        };
      };
      ratings: {
        Row: {
          id: string;
          user_id: string;
          provider_id: string;
          rating: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider_id: string;
          rating: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider_id?: string;
          rating?: number;
          created_at?: string;
        };
      };
      provider_hires: {
        Row: {
          id: string;
          user_id: string;
          provider_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider_id?: string;
          created_at?: string;
        };
      };
      events: {
        Row: {
          id: string;
          community_id: string;
          created_by: string;
          title: string;
          description: string | null;
          event_date: string;
          goal_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          community_id: string;
          created_by: string;
          title: string;
          description?: string | null;
          event_date: string;
          goal_amount?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          community_id?: string;
          created_by?: string;
          title?: string;
          description?: string | null;
          event_date?: string;
          goal_amount?: number;
          created_at?: string;
        };
      };
      event_transactions: {
        Row: {
          id: string;
          event_id: string;
          amount: number;
          type: 'income' | 'expense';
          category: string;
          title: string | null;
          description: string | null;
          contributor_user_id: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          amount: number;
          type: 'income' | 'expense';
          category: string;
          title?: string | null;
          description?: string | null;
          contributor_user_id?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          amount?: number;
          type?: 'income' | 'expense';
          category?: string;
          title?: string | null;
          description?: string | null;
          contributor_user_id?: string | null;
          created_by?: string;
          created_at?: string;
        };
      };
      fund_roles: {
        Row: {
          id: string;
          event_id: string;
          user_id: string;
          role: 'treasurer' | 'collector';
          assigned_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          user_id: string;
          role: 'treasurer' | 'collector';
          assigned_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          user_id?: string;
          role?: 'treasurer' | 'collector';
          assigned_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

export type BaseDatabaseProvider = Tables<'service_providers'>;
export type ProviderWithInteraction = BaseDatabaseProvider & {
  is_favorite?: boolean;
  user_rating?: number | null;
  hire_count?: number;
};
