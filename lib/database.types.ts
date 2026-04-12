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
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          community_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          community_id?: string | null;
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
};
