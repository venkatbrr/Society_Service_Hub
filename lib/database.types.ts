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
      communities: {
        Row: {
          address: string | null
          approximate_units: string | null
          area: string | null
          city: string | null
          code: string
          community_type: string | null
          created_at: string | null
          id: string
          name: string
          pincode: string | null
        }
        Insert: {
          address?: string | null
          approximate_units?: string | null
          area?: string | null
          city?: string | null
          code: string
          community_type?: string | null
          created_at?: string | null
          id?: string
          name: string
          pincode?: string | null
        }
        Update: {
          address?: string | null
          approximate_units?: string | null
          area?: string | null
          city?: string | null
          code?: string
          community_type?: string | null
          created_at?: string | null
          id?: string
          name?: string
          pincode?: string | null
        }
        Relationships: []
      }
      community_requests: {
        Row: {
          address: string | null
          approximate_units: string | null
          area: string | null
          city: string
          community_type: string
          created_at: string
          id: string
          name: string
          pincode: string
          proof_photo_url: string | null
          rejection_reason: string | null
          requested_by: string
          requester_flat_number: string | null
          resulting_community_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["community_request_status_type"]
        }
        Insert: {
          address?: string | null
          approximate_units?: string | null
          area?: string | null
          city: string
          community_type: string
          created_at?: string
          id?: string
          name: string
          pincode: string
          proof_photo_url?: string | null
          rejection_reason?: string | null
          requested_by: string
          requester_flat_number?: string | null
          resulting_community_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["community_request_status_type"]
        }
        Update: {
          address?: string | null
          approximate_units?: string | null
          area?: string | null
          city?: string
          community_type?: string
          created_at?: string
          id?: string
          name?: string
          pincode?: string
          proof_photo_url?: string | null
          rejection_reason?: string | null
          requested_by?: string
          requester_flat_number?: string | null
          resulting_community_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["community_request_status_type"]
        }
        Relationships: [
          {
            foreignKeyName: "community_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_requests_resulting_community_id_fkey"
            columns: ["resulting_community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "favorites_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_verdicts: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string
          entity_type: string
          flag_count: number
          hard_block_triggered: boolean
          id: string
          input_snapshot: Json | null
          summary: string | null
          triggered_rules: Json
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id: string
          entity_type: string
          flag_count?: number
          hard_block_triggered?: boolean
          id?: string
          input_snapshot?: Json | null
          summary?: string | null
          triggered_rules?: Json
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          flag_count?: number
          hard_block_triggered?: boolean
          id?: string
          input_snapshot?: Json | null
          summary?: string | null
          triggered_rules?: Json
        }
        Relationships: []
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
      profile_audit_log: {
        Row: {
          actor_id: string | null
          created_at: string
          field: string
          id: string
          new_value: string | null
          old_value: string | null
          profile_id: string
          reason: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          profile_id: string
          reason?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          profile_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_audit_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          app_role: Database["public"]["Enums"]["app_role_type"]
          avatar_url: string | null
          community_id: string | null
          created_at: string | null
          email: string | null
          expo_push_token: string | null
          flat_number: string | null
          full_name: string | null
          id: string
          phone_number: string | null
          removed_at: string | null
          removed_by: string | null
        }
        Insert: {
          app_role?: Database["public"]["Enums"]["app_role_type"]
          avatar_url?: string | null
          community_id?: string | null
          created_at?: string | null
          email?: string | null
          expo_push_token?: string | null
          flat_number?: string | null
          full_name?: string | null
          id: string
          phone_number?: string | null
          removed_at?: string | null
          removed_by?: string | null
        }
        Update: {
          app_role?: Database["public"]["Enums"]["app_role_type"]
          avatar_url?: string | null
          community_id?: string | null
          created_at?: string | null
          email?: string | null
          expo_push_token?: string | null
          flat_number?: string | null
          full_name?: string | null
          id?: string
          phone_number?: string | null
          removed_at?: string | null
          removed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          created_at: string | null
          fraud_rules_triggered: Json | null
          fraud_status: string | null
          id: string
          provider_id: string
          rating: number
          review_text: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          fraud_rules_triggered?: Json | null
          fraud_status?: string | null
          id?: string
          provider_id: string
          rating: number
          review_text?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          fraud_rules_triggered?: Json | null
          fraud_status?: string | null
          id?: string
          provider_id?: string
          rating?: number
          review_text?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
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
          details: Json | null
          flat_block: string | null
          fraud_status: string | null
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
          details?: Json | null
          flat_block?: string | null
          fraud_status?: string | null
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
          details?: Json | null
          flat_block?: string | null
          fraud_status?: string | null
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
      user_services: {
        Row: {
          category: string
          community_id: string | null
          created_at: string
          frequency_months: number
          id: string
          last_serviced_on: string
          next_due_on: string
          notes: string | null
          notified_at: string | null
          provider_id: string | null
          service_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          community_id?: string | null
          created_at?: string
          frequency_months: number
          id?: string
          last_serviced_on: string
          next_due_on: string
          notes?: string | null
          notified_at?: string | null
          provider_id?: string | null
          service_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          community_id?: string | null
          created_at?: string
          frequency_months?: number
          id?: string
          last_serviced_on?: string
          next_due_on?: string
          notes?: string | null
          notified_at?: string | null
          provider_id?: string | null
          service_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_services_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_services_provider_id_fkey"
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
      community_lead_remove_resident: {
        Args: { p_reason?: string; p_target_profile_id: string }
        Returns: undefined
      }
      create_community_admin_request: {
        Args: { p_target_user_id: string }
        Returns: string
      }
      generate_community_code: { Args: never; Returns: string }
      get_all_communities: {
        Args: { p_search?: string }
        Returns: {
          area: string
          city: string
          community_type: string
          id: string
          name: string
          pincode: string
          resident_count: number
        }[]
      }
      get_community_insights: {
        Args: { p_community_id: string }
        Returns: Json
      }
      get_community_visits: {
        Args: {
          p_community_id: string
          p_status?: string
          p_time_scope?: string
          p_user_id: string
        }
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
      get_my_due_soon_count: { Args: never; Returns: number }
      get_my_upcoming_services: {
        Args: never
        Returns: {
          category: string
          community_id: string
          created_at: string
          days_until_due: number
          frequency_months: number
          id: string
          last_serviced_on: string
          next_due_on: string
          notes: string
          notified_at: string
          provider_id: string
          service_name: string
          updated_at: string
          user_id: string
        }[]
      }
      get_residents_directory: {
        Args: { p_include_phone?: boolean }
        Returns: {
          app_role: Database["public"]["Enums"]["app_role_type"]
          flat_number: string
          full_name: string
          id: string
          phone_number: string
        }[]
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
      is_community_lead: { Args: { p_user_id?: string }; Returns: boolean }
      is_platform_admin: { Args: { p_user_id?: string }; Returns: boolean }
      is_user_approved: { Args: { p_user_id?: string }; Returns: boolean }
      join_community_by_code: { Args: { p_code: string }; Returns: Json }
      mark_service_done: {
        Args: { p_service_id: string }
        Returns: {
          category: string
          community_id: string | null
          created_at: string
          frequency_months: number
          id: string
          last_serviced_on: string
          next_due_on: string
          notes: string | null
          notified_at: string | null
          provider_id: string | null
          service_name: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_services"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      normalize_indian_mobile: { Args: { p_value: string }; Returns: string }
      notify_due_services: { Args: never; Returns: number }
      platform_approve_community_request: {
        Args: { p_request_id: string }
        Returns: string
      }
      platform_reject_community_request: {
        Args: { p_rejection_reason?: string; p_request_id: string }
        Returns: undefined
      }
      platform_soft_remove_resident: {
        Args: { p_reason?: string; p_target_profile_id: string }
        Returns: undefined
      }
      set_audit_actor: { Args: { p_actor_id: string }; Returns: undefined }
      set_audit_context: {
        Args: { p_actor_id: string; p_reason?: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_community_request: {
        Args: {
          p_address?: string
          p_approximate_units?: string
          p_area?: string
          p_city: string
          p_community_type?: string
          p_name: string
          p_pincode: string
          p_proof_photo_url?: string
          p_requester_flat_number?: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role_type: "admin" | "community_admin" | "resident" | "community_lead"
      approval_status_type: "pending" | "approved" | "rejected"
      community_request_status_type:
        | "pending"
        | "approved"
        | "rejected"
        | "needs_info"
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
    Enums: {
      app_role_type: ["admin", "community_admin", "resident", "community_lead"],
      approval_status_type: ["pending", "approved", "rejected"],
      community_request_status_type: [
        "pending",
        "approved",
        "rejected",
        "needs_info",
      ],
    },
  },
} as const

// Custom composite types (hand-authored; NOT generated)
type ServiceProviderRow = Database["public"]["Tables"]["service_providers"]["Row"]
export interface ProviderWithInteraction extends ServiceProviderRow {
  is_favorite: boolean
  hire_count: number
  user_rating?: number | null
  fraud_status: string | null
}

type ServiceVisitRow = Database["public"]["Tables"]["service_visits"]["Row"]
export interface VisitWithJoinerData extends ServiceVisitRow {
  creator_name?: string
  creator_flat?: string
  creator_avatar_url?: string
  joiner_count: number
  has_user_joined: boolean
}

export interface VisitJoinerWithProfile {
  id: string
  visit_id: string
  user_id: string
  joined_at?: string
  full_name: string | null
  flat_number: string | null
  avatar_url: string | null
  user_name?: string
  note?: string
}
