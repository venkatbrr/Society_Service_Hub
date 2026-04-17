export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      business_inquiries: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          inquiry_type: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          inquiry_type: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          inquiry_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_inquiries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "resident_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_offerings: {
        Row: {
          availability: string | null
          business_id: string
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          is_available: boolean | null
          name: string
          photo_url: string | null
          price: number
          price_unit: string | null
          sort_order: number | null
        }
        Insert: {
          availability?: string | null
          business_id: string
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_available?: boolean | null
          name: string
          photo_url?: string | null
          price: number
          price_unit?: string | null
          sort_order?: number | null
        }
        Update: {
          availability?: string | null
          business_id?: string
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_available?: boolean | null
          name?: string
          photo_url?: string | null
          price?: number
          price_unit?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "business_offerings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "resident_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          code: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      event_transactions: {
        Row: {
          amount: number
          category: string
          contributor_user_id: string | null
          created_at: string | null
          created_by: string
          description: string | null
          event_id: string
          id: string
          title: string | null
          type: string
        }
        Insert: {
          amount: number
          category: string
          contributor_user_id?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          event_id: string
          id?: string
          title?: string | null
          type: string
        }
        Update: {
          amount?: number
          category?: string
          contributor_user_id?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          event_id?: string
          id?: string
          title?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_transactions_contributor_user_id_fkey"
            columns: ["contributor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_transactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          community_id: string
          created_at: string | null
          created_by: string
          description: string | null
          event_date: string
          goal_amount: number | null
          id: string
          title: string
        }
        Insert: {
          community_id: string
          created_at?: string | null
          created_by: string
          description?: string | null
          event_date: string
          goal_amount?: number | null
          id?: string
          title: string
        }
        Update: {
          community_id?: string
          created_at?: string | null
          created_by?: string
          description?: string | null
          event_date?: string
          goal_amount?: number | null
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          provider_id: string | null
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          provider_id?: string | null
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          provider_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "resident_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_roles: {
        Row: {
          assigned_by: string
          created_at: string | null
          event_id: string
          id: string
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_by: string
          created_at?: string | null
          event_id: string
          id?: string
          role: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_by?: string
          created_at?: string | null
          event_id?: string
          id?: string
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_roles_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string | null
          data: Json | null
          id: string
          is_read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          app_role: string | null
          avatar_url: string | null
          community_id: string | null
          created_at: string | null
          expo_push_token: string | null
          flat_number: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          app_role?: string | null
          avatar_url?: string | null
          community_id?: string | null
          created_at?: string | null
          expo_push_token?: string | null
          flat_number?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          app_role?: string | null
          avatar_url?: string | null
          community_id?: string | null
          created_at?: string | null
          expo_push_token?: string | null
          flat_number?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_hires: {
        Row: {
          created_at: string | null
          id: string
          provider_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          provider_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          provider_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_hires_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          provider_id: string | null
          rating: number
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          provider_id?: string | null
          rating: number
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          provider_id?: string | null
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "resident_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      resident_businesses: {
        Row: {
          category: string
          community_id: string
          cover_photo_url: string | null
          created_at: string | null
          description: string | null
          id: string
          is_accepting_orders: boolean | null
          name: string
          operating_hours: string | null
          order_cutoff: string | null
          owner_id: string
          phone_number: string | null
          updated_at: string | null
          whatsapp_number: string | null
        }
        Insert: {
          category: string
          community_id: string
          cover_photo_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_accepting_orders?: boolean | null
          name: string
          operating_hours?: string | null
          order_cutoff?: string | null
          owner_id: string
          phone_number?: string | null
          updated_at?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          category?: string
          community_id?: string
          cover_photo_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_accepting_orders?: boolean | null
          name?: string
          operating_hours?: string | null
          order_cutoff?: string | null
          owner_id?: string
          phone_number?: string | null
          updated_at?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resident_businesses_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      service_providers: {
        Row: {
          avg_rating: number | null
          category: string
          community_id: string
          created_at: string | null
          created_by: string
          description: string | null
          flat_block: string | null
          id: string
          is_trending: boolean | null
          is_verified: boolean | null
          name: string
          phone: string
          rating_count: number | null
          updated_at: string | null
        }
        Insert: {
          avg_rating?: number | null
          category: string
          community_id: string
          created_at?: string | null
          created_by: string
          description?: string | null
          flat_block?: string | null
          id?: string
          is_trending?: boolean | null
          is_verified?: boolean | null
          name: string
          phone: string
          rating_count?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_rating?: number | null
          category?: string
          community_id?: string
          created_at?: string | null
          created_by?: string
          description?: string | null
          flat_block?: string | null
          id?: string
          is_trending?: boolean | null
          is_verified?: boolean | null
          name?: string
          phone?: string
          rating_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_providers_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      service_visits: {
        Row: {
          category: string
          community_id: string
          created_at: string | null
          created_by: string
          description: string | null
          estimated_cost: string | null
          id: string
          max_joiners: number | null
          provider_id: string | null
          provider_name: string
          provider_phone: string | null
          provider_whatsapp: string | null
          status: string
          title: string
          updated_at: string | null
          visit_date: string
          visit_time_slot: string
        }
        Insert: {
          category: string
          community_id: string
          created_at?: string | null
          created_by: string
          description?: string | null
          estimated_cost?: string | null
          id?: string
          max_joiners?: number | null
          provider_id?: string | null
          provider_name: string
          provider_phone?: string | null
          provider_whatsapp?: string | null
          status?: string
          title: string
          updated_at?: string | null
          visit_date: string
          visit_time_slot: string
        }
        Update: {
          category?: string
          community_id?: string
          created_at?: string | null
          created_by?: string
          description?: string | null
          estimated_cost?: string | null
          id?: string
          max_joiners?: number | null
          provider_id?: string | null
          provider_name?: string
          provider_phone?: string | null
          provider_whatsapp?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          visit_date?: string
          visit_time_slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_visits_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visits_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_joiners: {
        Row: {
          created_at: string | null
          flat_number: string | null
          id: string
          note: string | null
          user_id: string
          visit_id: string
        }
        Insert: {
          created_at?: string | null
          flat_number?: string | null
          id?: string
          note?: string | null
          user_id: string
          visit_id: string
        }
        Update: {
          created_at?: string | null
          flat_number?: string | null
          id?: string
          note?: string | null
          user_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_joiners_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auto_complete_past_visits: { Args: never; Returns: undefined }
      get_community_businesses: {
        Args: { p_community_id: string }
        Returns: {
          avg_rating: number
          category: string
          cover_photo_url: string
          description: string
          id: string
          inquiry_count: number
          is_accepting_orders: boolean
          name: string
          operating_hours: string
          order_cutoff: string
          owner_flat: string
          owner_id: string
          owner_name: string
          rating_count: number
        }[]
      }
      get_community_insights: {
        Args: { p_community_id: string }
        Returns: Json
      }
      get_community_visits: {
        Args: { p_community_id: string; p_status?: string; p_user_id: string }
        Returns: {
          category: string
          created_at: string
          created_by: string
          creator_avatar_url: string
          creator_flat: string
          creator_name: string
          description: string
          estimated_cost: string
          has_user_joined: boolean
          id: string
          joiner_count: number
          max_joiners: number
          provider_id: string
          provider_name: string
          provider_phone: string
          provider_whatsapp: string
          status: string
          title: string
          visit_date: string
          visit_time_slot: string
        }[]
      }
      get_fund_role: {
        Args: { p_event_id: string; p_user_id?: string }
        Returns: string
      }
      get_user_community_id: { Args: never; Returns: string }
      get_visit_joiners: {
        Args: { p_visit_id: string }
        Returns: {
          avatar_url: string
          flat_number: string
          id: string
          joined_at: string
          note: string
          user_id: string
          user_name: string
        }[]
      }
      is_admin: { Args: { p_user_id?: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
