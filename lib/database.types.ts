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
          flat_number: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          community_id?: string | null;
          app_role?: 'admin' | 'resident';
          flat_number?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          community_id?: string | null;
          app_role?: 'admin' | 'resident';
          flat_number?: string | null;
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
      service_visits: {
        Row: {
          id: string;
          community_id: string;
          created_by: string;
          provider_id: string | null;
          provider_name: string;
          provider_phone: string | null;
          provider_whatsapp: string | null;
          title: string;
          description: string | null;
          category: string;
          visit_date: string;
          visit_time_slot: string;
          estimated_cost: string | null;
          max_joiners: number | null;
          status: 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          community_id: string;
          created_by: string;
          provider_id?: string | null;
          provider_name: string;
          provider_phone?: string | null;
          provider_whatsapp?: string | null;
          title: string;
          description?: string | null;
          category: string;
          visit_date: string;
          visit_time_slot: string;
          estimated_cost?: string | null;
          max_joiners?: number | null;
          status?: 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          community_id?: string;
          created_by?: string;
          provider_id?: string | null;
          provider_name?: string;
          provider_phone?: string | null;
          provider_whatsapp?: string | null;
          title?: string;
          description?: string | null;
          category?: string;
          visit_date?: string;
          visit_time_slot?: string;
          estimated_cost?: string | null;
          max_joiners?: number | null;
          status?: 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
          created_at?: string;
          updated_at?: string;
        };
      };
      visit_joiners: {
        Row: {
          id: string;
          visit_id: string;
          user_id: string;
          note: string | null;
          flat_number: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          visit_id: string;
          user_id: string;
          note?: string | null;
          flat_number?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          visit_id?: string;
          user_id?: string;
          note?: string | null;
          flat_number?: string | null;
          created_at?: string;
        };
      };
      resident_businesses: {
        Row: {
          id: string;
          community_id: string;
          owner_id: string;
          name: string;
          description: string | null;
          category: string;
          cover_photo_url: string | null;
          whatsapp_number: string | null;
          phone_number: string | null;
          operating_hours: string | null;
          order_cutoff: string | null;
          is_accepting_orders: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          community_id: string;
          owner_id: string;
          name: string;
          description?: string | null;
          category: string;
          cover_photo_url?: string | null;
          whatsapp_number?: string | null;
          phone_number?: string | null;
          operating_hours?: string | null;
          order_cutoff?: string | null;
          is_accepting_orders?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          community_id?: string;
          owner_id?: string;
          name?: string;
          description?: string | null;
          category?: string;
          cover_photo_url?: string | null;
          whatsapp_number?: string | null;
          phone_number?: string | null;
          operating_hours?: string | null;
          order_cutoff?: string | null;
          is_accepting_orders?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      business_offerings: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          description: string | null;
          price: number;
          price_unit: string;
          category: string | null;
          photo_url: string | null;
          availability: string;
          is_available: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          description?: string | null;
          price: number;
          price_unit?: string;
          category?: string | null;
          photo_url?: string | null;
          availability?: string;
          is_available?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          description?: string | null;
          price?: number;
          price_unit?: string;
          category?: string | null;
          photo_url?: string | null;
          availability?: string;
          is_available?: boolean;
          sort_order?: number;
          created_at?: string;
        };
      };
      business_inquiries: {
        Row: {
          id: string;
          business_id: string;
          user_id: string;
          inquiry_type: 'whatsapp' | 'call';
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          user_id: string;
          inquiry_type: 'whatsapp' | 'call';
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          user_id?: string;
          inquiry_type?: 'whatsapp' | 'call';
          created_at?: string;
        };
      };
      favorites: {
        Row: {
          id: string;
          user_id: string;
          provider_id: string | null;
          business_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider_id?: string | null;
          business_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider_id?: string | null;
          business_id?: string | null;
          created_at?: string;
        };
      };
      ratings: {
        Row: {
          id: string;
          user_id: string;
          provider_id: string | null;
          business_id: string | null;
          rating: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider_id?: string | null;
          business_id?: string | null;
          rating: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider_id?: string | null;
          business_id?: string | null;
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

export type BaseResidentBusiness = Tables<'resident_businesses'>;
export type BusinessWithInteraction = BaseResidentBusiness & {
  is_favorite?: boolean;
  user_rating?: number | null;
  inquiry_count?: number;
  avg_rating?: number;
  rating_count?: number;
  owner_name?: string;
  owner_flat?: string;
};

export type VisitWithJoinerData = Tables<'service_visits'> & {
  creator_name?: string;
  creator_flat?: string;
  creator_avatar_url?: string;
  joiner_count?: number;
  has_user_joined?: boolean;
};

export type VisitJoinerWithProfile = Tables<'visit_joiners'> & {
  user_name?: string;
  avatar_url?: string;
  joined_at?: string;
};
