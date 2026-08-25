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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      announcement_audiences: {
        Row: {
          announcement_id: string
          created_at: string
          id: string
          target_id: string
          target_type: string
        }
        Insert: {
          announcement_id: string
          created_at?: string
          id?: string
          target_id: string
          target_type: string
        }
        Update: {
          announcement_id?: string
          created_at?: string
          id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_audiences_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "community_announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      blood_donors: {
        Row: {
          blood_group: string
          community_id: string
          contact_phone: string
          created_at: string
          id: string
          is_available: boolean
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          blood_group: string
          community_id: string
          contact_phone: string
          created_at?: string
          id?: string
          is_available?: boolean
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          blood_group?: string
          community_id?: string
          contact_phone?: string
          created_at?: string
          id?: string
          is_available?: boolean
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blood_donors_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          address: string | null
          approximate_units: string | null
          area: string | null
          block_label: string
          blocks_enabled: boolean
          city: string | null
          code: string
          community_type: string | null
          created_at: string | null
          funds_enabled: boolean
          id: string
          name: string
          pincode: string | null
        }
        Insert: {
          address?: string | null
          approximate_units?: string | null
          area?: string | null
          block_label?: string
          blocks_enabled?: boolean
          city?: string | null
          code: string
          community_type?: string | null
          created_at?: string | null
          funds_enabled?: boolean
          id?: string
          name: string
          pincode?: string | null
        }
        Update: {
          address?: string | null
          approximate_units?: string | null
          area?: string | null
          block_label?: string
          blocks_enabled?: boolean
          city?: string | null
          code?: string
          community_type?: string | null
          created_at?: string | null
          funds_enabled?: boolean
          id?: string
          name?: string
          pincode?: string | null
        }
        Relationships: []
      }
      community_announcements: {
        Row: {
          author_id: string
          body: string
          community_id: string
          created_at: string
          expires_at: string | null
          id: string
          pinned: boolean
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          author_id: string
          body: string
          community_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          pinned?: boolean
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_id?: string
          body?: string
          community_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "community_announcements_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_blocks: {
        Row: {
          archived_at: string | null
          community_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          community_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          community_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_blocks_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_event_contacts: {
        Row: {
          event_id: string
          id: string
          name: string
          phone: string
          role_label: string | null
          sort_order: number
        }
        Insert: {
          event_id: string
          id?: string
          name: string
          phone: string
          role_label?: string | null
          sort_order?: number
        }
        Update: {
          event_id?: string
          id?: string
          name?: string
          phone?: string
          role_label?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_event_contacts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "community_events"
            referencedColumns: ["id"]
          },
        ]
      }
      community_event_organizers: {
        Row: {
          community_id: string
          created_at: string
          granted_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          community_id: string
          created_at?: string
          granted_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          community_id?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_event_organizers_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_event_organizers_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_event_organizers_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "community_event_organizers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_event_organizers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      community_events: {
        Row: {
          cancellation_note: string | null
          cancelled_at: string | null
          category: string
          community_id: string
          created_at: string
          created_by: string
          description: string | null
          end_time: string | null
          entry_fee: number | null
          event_date: string
          id: string
          image_url: string | null
          registration_last_date: string | null
          registration_link: string | null
          start_time: string | null
          status: string
          title: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          cancellation_note?: string | null
          cancelled_at?: string | null
          category?: string
          community_id: string
          created_at?: string
          created_by: string
          description?: string | null
          end_time?: string | null
          entry_fee?: number | null
          event_date: string
          id?: string
          image_url?: string | null
          registration_last_date?: string | null
          registration_link?: string | null
          start_time?: string | null
          status?: string
          title: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          cancellation_note?: string | null
          cancelled_at?: string | null
          category?: string
          community_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          end_time?: string | null
          entry_fee?: number | null
          event_date?: string
          id?: string
          image_url?: string | null
          registration_last_date?: string | null
          registration_link?: string | null
          start_time?: string | null
          status?: string
          title?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_events_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      community_flats: {
        Row: {
          archived_at: string | null
          block_id: string | null
          community_id: string
          created_at: string
          flat_number: string
          floor_label: string | null
          id: string
          occupant_name: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          block_id?: string | null
          community_id: string
          created_at?: string
          flat_number: string
          floor_label?: string | null
          id?: string
          occupant_name?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          block_id?: string | null
          community_id?: string
          created_at?: string
          flat_number?: string
          floor_label?: string | null
          id?: string
          occupant_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_flats_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "community_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_flats_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_group_members: {
        Row: {
          community_id: string
          group_id: string
          joined_at: string
          role: string
        }
        Insert: {
          community_id: string
          group_id: string
          joined_at?: string
          role?: string
        }
        Update: {
          community_id?: string
          group_id?: string
          joined_at?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_group_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      community_groups: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      community_partnerships: {
        Row: {
          accepted_by: string | null
          community_a_id: string
          community_b_id: string
          created_at: string
          id: string
          initiated_by: string
          scope: Json
          status: string
          updated_at: string
        }
        Insert: {
          accepted_by?: string | null
          community_a_id: string
          community_b_id: string
          created_at?: string
          id?: string
          initiated_by: string
          scope?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_by?: string | null
          community_a_id?: string
          community_b_id?: string
          created_at?: string
          id?: string
          initiated_by?: string
          scope?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_partnerships_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_partnerships_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "community_partnerships_community_a_id_fkey"
            columns: ["community_a_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_partnerships_community_b_id_fkey"
            columns: ["community_b_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_partnerships_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_partnerships_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      community_requests: {
        Row: {
          address: string | null
          approximate_units: string | null
          area: string | null
          block_details: Json | null
          block_label: string | null
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
          block_details?: Json | null
          block_label?: string | null
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
          block_details?: Json | null
          block_label?: string | null
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
            foreignKeyName: "community_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
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
          {
            foreignKeyName: "community_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          category: string
          community_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          phone: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category: string
          community_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          community_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      event_transactions: {
        Row: {
          amount: number
          category: string
          collected_by_name: string | null
          contributor_flat_id: string | null
          contributor_name: string | null
          contributor_user_id: string | null
          created_at: string | null
          created_by: string
          description: string | null
          event_id: string
          id: string
          image_url: string | null
          payment_method: string | null
          sponsor_name: string | null
          sponsor_note: string | null
          sponsor_phone: string | null
          title: string | null
          type: string
        }
        Insert: {
          amount: number
          category: string
          collected_by_name?: string | null
          contributor_flat_id?: string | null
          contributor_name?: string | null
          contributor_user_id?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          event_id: string
          id?: string
          image_url?: string | null
          payment_method?: string | null
          sponsor_name?: string | null
          sponsor_note?: string | null
          sponsor_phone?: string | null
          title?: string | null
          type: string
        }
        Update: {
          amount?: number
          category?: string
          collected_by_name?: string | null
          contributor_flat_id?: string | null
          contributor_name?: string | null
          contributor_user_id?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          event_id?: string
          id?: string
          image_url?: string | null
          payment_method?: string | null
          sponsor_name?: string | null
          sponsor_note?: string | null
          sponsor_phone?: string | null
          title?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_transactions_contributor_flat_id_fkey"
            columns: ["contributor_flat_id"]
            isOneToOne: false
            referencedRelation: "community_flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_transactions_contributor_user_id_fkey"
            columns: ["contributor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_transactions_contributor_user_id_fkey"
            columns: ["contributor_user_id"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
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
          fund_scope: string
          goal_amount: number | null
          group_id: string | null
          id: string
          is_closed: boolean | null
          partnership_id: string | null
          title: string
        }
        Insert: {
          community_id: string
          created_at?: string | null
          created_by: string
          description?: string | null
          event_date: string
          fund_scope?: string
          goal_amount?: number | null
          group_id?: string | null
          id?: string
          is_closed?: boolean | null
          partnership_id?: string | null
          title: string
        }
        Update: {
          community_id?: string
          created_at?: string | null
          created_by?: string
          description?: string | null
          event_date?: string
          fund_scope?: string
          goal_amount?: number | null
          group_id?: string | null
          id?: string
          is_closed?: boolean | null
          partnership_id?: string | null
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
          {
            foreignKeyName: "events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "community_partnerships"
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
      feedback_reports: {
        Row: {
          community_id: string | null
          created_at: string
          id: string
          image_url: string | null
          kind: string
          message: string
          user_id: string
        }
        Insert: {
          community_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          kind: string
          message: string
          user_id: string
        }
        Update: {
          community_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          kind?: string
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_reports_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      flat_addition_requests: {
        Row: {
          block_id: string
          community_id: string
          created_at: string
          flat_number: string
          id: string
          rejection_reason: string | null
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          block_id: string
          community_id: string
          created_at?: string
          flat_number: string
          id?: string
          rejection_reason?: string | null
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          block_id?: string
          community_id?: string
          created_at?: string
          flat_number?: string
          id?: string
          rejection_reason?: string | null
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flat_addition_requests_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "community_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flat_addition_requests_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flat_addition_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flat_addition_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "flat_addition_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flat_addition_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
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
          block_id: string | null
          created_at: string | null
          event_id: string
          id: string
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_by: string
          block_id?: string | null
          created_at?: string | null
          event_id: string
          id?: string
          role: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_by?: string
          block_id?: string | null
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
            foreignKeyName: "fund_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fund_roles_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "community_blocks"
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
          {
            foreignKeyName: "fund_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      funds_access_requests: {
        Row: {
          community_id: string
          contact_name: string
          contact_phone: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          designated_lead_id: string | null
          id: string
          purpose: string | null
          rejection_reason: string | null
          requested_by: string
          status: string
        }
        Insert: {
          community_id: string
          contact_name: string
          contact_phone: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          designated_lead_id?: string | null
          id?: string
          purpose?: string | null
          rejection_reason?: string | null
          requested_by: string
          status?: string
        }
        Update: {
          community_id?: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          designated_lead_id?: string | null
          id?: string
          purpose?: string | null
          rejection_reason?: string | null
          requested_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "funds_access_requests_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funds_access_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funds_access_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "funds_access_requests_designated_lead_id_fkey"
            columns: ["designated_lead_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funds_access_requests_designated_lead_id_fkey"
            columns: ["designated_lead_id"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "funds_access_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funds_access_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      funds_access_revocations: {
        Row: {
          community_id: string
          id: string
          reason: string
          revoked_at: string
          revoked_by: string | null
        }
        Insert: {
          community_id: string
          id?: string
          reason: string
          revoked_at?: string
          revoked_by?: string | null
        }
        Update: {
          community_id?: string
          id?: string
          reason?: string
          revoked_at?: string
          revoked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funds_access_revocations_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funds_access_revocations_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funds_access_revocations_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      hire_feedback: {
        Row: {
          created_at: string
          hire_id: string
          id: string
          note: string | null
          provider_id: string
          signal: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hire_id: string
          id?: string
          note?: string | null
          provider_id: string
          signal: string
          user_id: string
        }
        Update: {
          created_at?: string
          hire_id?: string
          id?: string
          note?: string | null
          provider_id?: string
          signal?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hire_feedback_hire_id_fkey"
            columns: ["hire_id"]
            isOneToOne: true
            referencedRelation: "provider_hires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hire_feedback_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      mcn_business_categories: {
        Row: {
          created_at: string
          emoji: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      mcn_carpool_requests: {
        Row: {
          carpool_id: string
          community_id: string
          created_at: string
          flat_number: string
          id: string
          note: string | null
          rider_id: string
          rider_name: string
          rider_phone: string
          seats_requested: number
          status: string
          updated_at: string
        }
        Insert: {
          carpool_id: string
          community_id: string
          created_at?: string
          flat_number: string
          id?: string
          note?: string | null
          rider_id: string
          rider_name: string
          rider_phone: string
          seats_requested?: number
          status?: string
          updated_at?: string
        }
        Update: {
          carpool_id?: string
          community_id?: string
          created_at?: string
          flat_number?: string
          id?: string
          note?: string | null
          rider_id?: string
          rider_name?: string
          rider_phone?: string
          seats_requested?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcn_carpool_requests_carpool_id_fkey"
            columns: ["carpool_id"]
            isOneToOne: false
            referencedRelation: "mcn_carpools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_carpool_requests_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_carpool_requests_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_carpool_requests_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      mcn_carpools: {
        Row: {
          available_seats: number
          community_id: string
          contact_phone: string | null
          created_at: string
          created_by: string
          departure_time: string
          end_point: string
          id: string
          notes: string | null
          price_per_seat: string | null
          price_per_seat_amount: number | null
          pricing_type: string
          recurring_days: string[]
          return_time: string | null
          role_type: string
          start_point: string
          status: string
          title: string
          trip_date: string | null
          updated_at: string
          vehicle_info: string | null
        }
        Insert: {
          available_seats?: number
          community_id: string
          contact_phone?: string | null
          created_at?: string
          created_by: string
          departure_time: string
          end_point: string
          id?: string
          notes?: string | null
          price_per_seat?: string | null
          price_per_seat_amount?: number | null
          pricing_type?: string
          recurring_days?: string[]
          return_time?: string | null
          role_type?: string
          start_point: string
          status?: string
          title: string
          trip_date?: string | null
          updated_at?: string
          vehicle_info?: string | null
        }
        Update: {
          available_seats?: number
          community_id?: string
          contact_phone?: string | null
          created_at?: string
          created_by?: string
          departure_time?: string
          end_point?: string
          id?: string
          notes?: string | null
          price_per_seat?: string | null
          price_per_seat_amount?: number | null
          pricing_type?: string
          recurring_days?: string[]
          return_time?: string | null
          role_type?: string
          start_point?: string
          status?: string
          title?: string
          trip_date?: string | null
          updated_at?: string
          vehicle_info?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mcn_carpools_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_carpools_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_carpools_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      mcn_drop_reports: {
        Row: {
          created_at: string
          details: string | null
          drop_id: string
          id: string
          reason: string
          reported_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          drop_id: string
          id?: string
          reason: string
          reported_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          drop_id?: string
          id?: string
          reason?: string
          reported_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcn_drop_reports_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "mcn_preorder_drops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_drop_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_drop_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      mcn_listing_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          listing_id: string
          reason: string
          reported_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          listing_id: string
          reason: string
          reported_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          listing_id?: string
          reason?: string
          reported_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcn_listing_reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "mcn_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_listing_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_listing_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      mcn_listings: {
        Row: {
          category_id: string | null
          community_id: string
          contact_phone: string | null
          created_at: string
          description: string | null
          flagged_for_review_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_community_business: boolean
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          community_id: string
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          flagged_for_review_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_community_business?: boolean
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          community_id?: string
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          flagged_for_review_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_community_business?: boolean
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcn_listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "mcn_business_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_listings_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_listings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_listings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      mcn_order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "mcn_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "mcn_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mcn_products"
            referencedColumns: ["id"]
          },
        ]
      }
      mcn_orders: {
        Row: {
          buyer_id: string
          buyer_note: string | null
          buyer_phone: string | null
          community_id: string
          created_at: string
          id: string
          listing_id: string
          status: string
          updated_at: string
        }
        Insert: {
          buyer_id: string
          buyer_note?: string | null
          buyer_phone?: string | null
          community_id: string
          created_at?: string
          id?: string
          listing_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          buyer_note?: string | null
          buyer_phone?: string | null
          community_id?: string
          created_at?: string
          id?: string
          listing_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcn_orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mcn_orders_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "mcn_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      mcn_parent_corner: {
        Row: {
          board: string
          community_id: string
          contact_phone: string
          created_at: string
          flat_number: string
          grade_class: string
          id: string
          institution_type: string
          intents: string[]
          notes: string | null
          parent_name: string
          school_catalog_id: string | null
          school_name: string
          student_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          board: string
          community_id: string
          contact_phone: string
          created_at?: string
          flat_number: string
          grade_class: string
          id?: string
          institution_type?: string
          intents?: string[]
          notes?: string | null
          parent_name: string
          school_catalog_id?: string | null
          school_name: string
          student_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          board?: string
          community_id?: string
          contact_phone?: string
          created_at?: string
          flat_number?: string
          grade_class?: string
          id?: string
          institution_type?: string
          intents?: string[]
          notes?: string | null
          parent_name?: string
          school_catalog_id?: string | null
          school_name?: string
          student_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcn_parent_corner_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_parent_corner_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_parent_corner_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      mcn_posts: {
        Row: {
          community_id: string
          contact_hint: string | null
          created_at: string
          description: string | null
          id: string
          is_available: boolean
          kind: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          community_id: string
          contact_hint?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_available?: boolean
          kind: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          community_id?: string
          contact_hint?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_available?: boolean
          kind?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcn_posts_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      mcn_preorder_drops: {
        Row: {
          community_id: string
          created_at: string
          created_by: string
          cutoff_at: string
          description: string | null
          flagged_by: string | null
          flagged_for_review_at: string | null
          flagged_prev_status: string | null
          flagged_reason: string | null
          fulfillment_date: string
          fulfillment_time: string
          id: string
          image_url: string | null
          listing_id: string | null
          max_orders: number | null
          meal_type: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          community_id: string
          created_at?: string
          created_by: string
          cutoff_at: string
          description?: string | null
          flagged_by?: string | null
          flagged_for_review_at?: string | null
          flagged_prev_status?: string | null
          flagged_reason?: string | null
          fulfillment_date: string
          fulfillment_time: string
          id?: string
          image_url?: string | null
          listing_id?: string | null
          max_orders?: number | null
          meal_type?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          created_by?: string
          cutoff_at?: string
          description?: string | null
          flagged_by?: string | null
          flagged_for_review_at?: string | null
          flagged_prev_status?: string | null
          flagged_reason?: string | null
          fulfillment_date?: string
          fulfillment_time?: string
          id?: string
          image_url?: string | null
          listing_id?: string | null
          max_orders?: number | null
          meal_type?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcn_preorder_drops_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_preorder_drops_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_preorder_drops_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mcn_preorder_drops_flagged_by_fkey"
            columns: ["flagged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_preorder_drops_flagged_by_fkey"
            columns: ["flagged_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mcn_preorder_drops_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "mcn_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      mcn_preorder_items: {
        Row: {
          created_at: string
          description: string | null
          diet_type: string
          drop_id: string
          id: string
          image_url: string | null
          max_quantity: number | null
          name: string
          price: number
          unit: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          diet_type?: string
          drop_id: string
          id?: string
          image_url?: string | null
          max_quantity?: number | null
          name: string
          price: number
          unit?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          diet_type?: string
          drop_id?: string
          id?: string
          image_url?: string | null
          max_quantity?: number | null
          name?: string
          price?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcn_preorder_items_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "mcn_preorder_drops"
            referencedColumns: ["id"]
          },
        ]
      }
      mcn_preorder_order_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          item_name: string
          order_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          item_name: string
          order_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          item_name?: string
          order_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "mcn_preorder_order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "mcn_preorder_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_preorder_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "mcn_preorder_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      mcn_preorder_orders: {
        Row: {
          buyer_id: string
          buyer_name: string
          buyer_note: string | null
          buyer_phone: string
          cancellation_note: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          community_id: string
          created_at: string
          drop_id: string
          flat_number: string
          id: string
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          buyer_id: string
          buyer_name: string
          buyer_note?: string | null
          buyer_phone: string
          cancellation_note?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          community_id: string
          created_at?: string
          drop_id: string
          flat_number: string
          id?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          buyer_name?: string
          buyer_note?: string | null
          buyer_phone?: string
          cancellation_note?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          community_id?: string
          created_at?: string
          drop_id?: string
          flat_number?: string
          id?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcn_preorder_orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_preorder_orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mcn_preorder_orders_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcn_preorder_orders_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "mcn_preorder_drops"
            referencedColumns: ["id"]
          },
        ]
      }
      mcn_products: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          item_type: string
          listing_id: string
          name: string
          price: number | null
          sort_order: number
          unit: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          item_type?: string
          listing_id: string
          name: string
          price?: number | null
          sort_order?: number
          unit: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          item_type?: string
          listing_id?: string
          name?: string
          price?: number | null
          sort_order?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcn_products_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "mcn_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel: string
          muted: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          muted?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          muted?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
            foreignKeyName: "profile_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profile_audit_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_audit_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          app_role: Database["public"]["Enums"]["app_role_type"]
          avatar_url: string | null
          block_id: string | null
          community_id: string | null
          created_at: string | null
          email: string | null
          expo_push_token: string | null
          flat_id: string | null
          flat_number: string | null
          full_name: string | null
          id: string
          last_active_at: string | null
          phone_number: string | null
          removed_at: string | null
          removed_by: string | null
        }
        Insert: {
          app_role?: Database["public"]["Enums"]["app_role_type"]
          avatar_url?: string | null
          block_id?: string | null
          community_id?: string | null
          created_at?: string | null
          email?: string | null
          expo_push_token?: string | null
          flat_id?: string | null
          flat_number?: string | null
          full_name?: string | null
          id: string
          last_active_at?: string | null
          phone_number?: string | null
          removed_at?: string | null
          removed_by?: string | null
        }
        Update: {
          app_role?: Database["public"]["Enums"]["app_role_type"]
          avatar_url?: string | null
          block_id?: string | null
          community_id?: string | null
          created_at?: string | null
          email?: string | null
          expo_push_token?: string | null
          flat_id?: string | null
          flat_number?: string | null
          full_name?: string | null
          id?: string
          last_active_at?: string | null
          phone_number?: string | null
          removed_at?: string | null
          removed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "community_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_flat_id_fkey"
            columns: ["flat_id"]
            isOneToOne: false
            referencedRelation: "community_flats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      provider_hires: {
        Row: {
          contact_date: string | null
          created_at: string | null
          id: string
          provider_id: string
          user_id: string
        }
        Insert: {
          contact_date?: string | null
          created_at?: string | null
          id?: string
          provider_id: string
          user_id: string
        }
        Update: {
          contact_date?: string | null
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
      provider_personal_notes: {
        Row: {
          created_at: string
          id: string
          note: string | null
          provider_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          provider_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          provider_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_personal_notes_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_public_rating_nudges: {
        Row: {
          nudged_at: string
          outcome: string | null
          provider_id: string
          user_id: string
        }
        Insert: {
          nudged_at?: string
          outcome?: string | null
          provider_id: string
          user_id: string
        }
        Update: {
          nudged_at?: string
          outcome?: string | null
          provider_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_public_rating_nudges_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          provider_id: string
          reason: string
          reported_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          provider_id: string
          reason: string
          reported_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          provider_id?: string
          reason?: string
          reported_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_reports_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      provider_shares: {
        Row: {
          created_at: string
          id: string
          provider_id: string
          shared_by: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider_id: string
          shared_by: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          provider_id?: string
          shared_by?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_shares_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_shares_shared_by_fkey"
            columns: ["shared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_shares_shared_by_fkey"
            columns: ["shared_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_seen_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_seen_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_seen_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          created_at: string | null
          fraud_rules_triggered: Json | null
          fraud_status: string | null
          id: string
          image_url: string | null
          listing_id: string | null
          provider_id: string | null
          rating: number
          review_text: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          fraud_rules_triggered?: Json | null
          fraud_status?: string | null
          id?: string
          image_url?: string | null
          listing_id?: string | null
          provider_id?: string | null
          rating: number
          review_text?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          fraud_rules_triggered?: Json | null
          fraud_status?: string | null
          id?: string
          image_url?: string | null
          listing_id?: string | null
          provider_id?: string | null
          rating?: number
          review_text?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "mcn_listings"
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
      school_reviews: {
        Row: {
          academics_comment: string | null
          academics_score: number
          child_grade: string
          community_id: string
          created_at: string
          happiness_comment: string | null
          happiness_score: number
          id: string
          infrastructure_comment: string | null
          infrastructure_score: number
          overall_comment: string | null
          safety_comment: string | null
          safety_score: number
          school_id: string
          sports_activities_comment: string | null
          sports_activities_score: number
          teachers_comment: string | null
          teachers_score: number
          transport_comment: string | null
          transport_score: number
          updated_at: string
          user_id: string
          value_comment: string | null
          value_score: number
        }
        Insert: {
          academics_comment?: string | null
          academics_score: number
          child_grade: string
          community_id: string
          created_at?: string
          happiness_comment?: string | null
          happiness_score: number
          id?: string
          infrastructure_comment?: string | null
          infrastructure_score: number
          overall_comment?: string | null
          safety_comment?: string | null
          safety_score: number
          school_id: string
          sports_activities_comment?: string | null
          sports_activities_score: number
          teachers_comment?: string | null
          teachers_score: number
          transport_comment?: string | null
          transport_score: number
          updated_at?: string
          user_id: string
          value_comment?: string | null
          value_score: number
        }
        Update: {
          academics_comment?: string | null
          academics_score?: number
          child_grade?: string
          community_id?: string
          created_at?: string
          happiness_comment?: string | null
          happiness_score?: number
          id?: string
          infrastructure_comment?: string | null
          infrastructure_score?: number
          overall_comment?: string | null
          safety_comment?: string | null
          safety_score?: number
          school_id?: string
          sports_activities_comment?: string | null
          sports_activities_score?: number
          teachers_comment?: string | null
          teachers_score?: number
          transport_comment?: string | null
          transport_score?: number
          updated_at?: string
          user_id?: string
          value_comment?: string | null
          value_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "school_reviews_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          area_locality: string | null
          avg_academics: number | null
          avg_happiness: number | null
          avg_infrastructure: number | null
          avg_safety: number | null
          avg_sports_activities: number | null
          avg_teachers: number | null
          avg_transport: number | null
          avg_value: number | null
          community_id: string
          contact_phone: string | null
          created_at: string
          created_by: string
          description: string | null
          distance: number
          facilities: string[]
          fee_range: string
          google_maps_link: string | null
          google_rating: string | null
          id: string
          level: string
          name: string
          review_count: number | null
          syllabus: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          area_locality?: string | null
          avg_academics?: number | null
          avg_happiness?: number | null
          avg_infrastructure?: number | null
          avg_safety?: number | null
          avg_sports_activities?: number | null
          avg_teachers?: number | null
          avg_transport?: number | null
          avg_value?: number | null
          community_id: string
          contact_phone?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          distance: number
          facilities?: string[]
          fee_range: string
          google_maps_link?: string | null
          google_rating?: string | null
          id?: string
          level: string
          name: string
          review_count?: number | null
          syllabus: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          area_locality?: string | null
          avg_academics?: number | null
          avg_happiness?: number | null
          avg_infrastructure?: number | null
          avg_safety?: number | null
          avg_sports_activities?: number | null
          avg_teachers?: number | null
          avg_transport?: number | null
          avg_value?: number | null
          community_id?: string
          contact_phone?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          distance?: number
          facilities?: string[]
          fee_range?: string
          google_maps_link?: string | null
          google_rating?: string | null
          id?: string
          level?: string
          name?: string
          review_count?: number | null
          syllabus?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schools_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schools_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schools_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_last_seen"
            referencedColumns: ["user_id"]
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
          shared_by_community_id: string | null
          updated_at: string | null
          visibility: string
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
          shared_by_community_id?: string | null
          updated_at?: string | null
          visibility?: string
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
          shared_by_community_id?: string | null
          updated_at?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_providers_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_providers_shared_by_community_id_fkey"
            columns: ["shared_by_community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      service_visit_communities: {
        Row: {
          community_id: string
          joined_at: string
          visit_id: string
        }
        Insert: {
          community_id: string
          joined_at?: string
          visit_id: string
        }
        Update: {
          community_id?: string
          joined_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_visit_communities_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_visit_communities_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "service_visits"
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
          host_community_id: string | null
          id: string
          is_cross_community: boolean
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
          host_community_id?: string | null
          id?: string
          is_cross_community?: boolean
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
          host_community_id?: string | null
          id?: string
          is_cross_community?: boolean
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
            foreignKeyName: "service_visits_host_community_id_fkey"
            columns: ["host_community_id"]
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
      user_service_history: {
        Row: {
          cost_paid: number | null
          created_at: string
          id: string
          note: string | null
          provider_id: string | null
          provider_name_snapshot: string | null
          service_id: string
          serviced_on: string
          user_id: string
        }
        Insert: {
          cost_paid?: number | null
          created_at?: string
          id?: string
          note?: string | null
          provider_id?: string | null
          provider_name_snapshot?: string | null
          service_id: string
          serviced_on: string
          user_id: string
        }
        Update: {
          cost_paid?: number | null
          created_at?: string
          id?: string
          note?: string | null
          provider_id?: string | null
          provider_name_snapshot?: string | null
          service_id?: string
          serviced_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_service_history_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_service_history_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "user_services"
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
          images: Json
          last_serviced_on: string
          next_due_on: string
          notes: string | null
          notified_at: string | null
          notify_count: number
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
          images?: Json
          last_serviced_on: string
          next_due_on: string
          notes?: string | null
          notified_at?: string | null
          notify_count?: number
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
          images?: Json
          last_serviced_on?: string
          next_due_on?: string
          notes?: string | null
          notified_at?: string | null
          notify_count?: number
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
      user_last_seen: {
        Row: {
          community_id: string | null
          last_seen_at: string | null
          user_id: string | null
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
      v_user_activity: {
        Row: {
          created_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_community_partnership: {
        Args: { p_partnership_id: string }
        Returns: undefined
      }
      add_community_block: {
        Args: { p_name: string }
        Returns: {
          archived_at: string | null
          community_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "community_blocks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_community_flats: {
        Args: { p_block_id: string; p_flat_numbers: string[] }
        Returns: number
      }
      allow_membership_change: { Args: never; Returns: undefined }
      archive_community_block: {
        Args: { p_block_id: string }
        Returns: undefined
      }
      archive_community_flat: {
        Args: { p_flat_id: string }
        Returns: undefined
      }
      assign_block_in_charge: {
        Args: { p_block_id: string; p_event_id: string; p_user_id: string }
        Returns: {
          assigned_by: string
          block_id: string | null
          created_at: string | null
          event_id: string
          id: string
          role: string
          updated_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "fund_roles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_user_see_announcement: {
        Args: { p_announcement_id: string; p_user_id?: string }
        Returns: boolean
      }
      can_user_see_provider: {
        Args: { p_provider_id: string; p_user_id?: string }
        Returns: boolean
      }
      can_user_see_visit: {
        Args: { p_user_id?: string; p_visit_id: string }
        Returns: boolean
      }
      check_mcn_drop_item_capacity: {
        Args: {
          p_drop_id: string
          p_existing_order_id?: string
          p_requested_qty: number
        }
        Returns: {
          can_place: boolean
          current_items: number
          effective_current_items: number
          max_items: number
          projected_items: number
          remaining_capacity: number
        }[]
      }
      check_mcn_drop_item_quantity_capacity: {
        Args: {
          p_existing_order_id?: string
          p_item_id: string
          p_requested_qty: number
        }
        Returns: {
          can_place: boolean
          current_quantity: number
          effective_current_quantity: number
          max_quantity: number
          projected_quantity: number
          remaining_capacity: number
        }[]
      }
      community_lead_readmit_resident: {
        Args: { p_target_profile_id: string }
        Returns: undefined
      }
      community_lead_remove_resident: {
        Args: { p_reason?: string; p_target_profile_id: string }
        Returns: undefined
      }
      delete_community_fund: {
        Args: { p_event_id: string }
        Returns: undefined
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
      get_community_og_card: {
        Args: { p_id: string }
        Returns: {
          address: string
          name: string
        }[]
      }
      get_community_pulse: {
        Args: { p_limit?: number }
        Returns: {
          entity_id: string
          happened_at: string
          kind: string
          summary: string
        }[]
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
      get_fund_public_blocks: {
        Args: { p_event_id: string }
        Returns: {
          block_name: string
          collected: number
          paid_flats: number
          total_flats: number
        }[]
      }
      get_fund_public_summary: {
        Args: { p_event_id: string }
        Returns: {
          balance: number
          collected: number
          community_name: string
          contributor_count: number
          fund_title: string
          is_closed: boolean
          spent: number
        }[]
      }
      get_fund_role: {
        Args: { p_event_id: string; p_user_id?: string }
        Returns: string
      }
      get_funds_access_status: {
        Args: never
        Returns: {
          decided_at: string
          rejection_reason: string
          request_id: string
          status: string
        }[]
      }
      get_listing_og_card: {
        Args: { p_id: string }
        Returns: {
          description: string
          image_url: string
          name: string
        }[]
      }
      get_mcn_carpool_passengers: {
        Args: { p_carpool_id: string }
        Returns: {
          passenger_flat: string
          passenger_name: string
          seats: number
        }[]
      }
      get_mcn_carpool_seats: {
        Args: { p_carpool_id: string }
        Returns: {
          booked_seats: number
          remaining_seats: number
          total_seats: number
        }[]
      }
      get_mcn_drop_item_availability: {
        Args: { p_drop_id: string }
        Returns: {
          item_id: string
          max_quantity: number
          remaining_quantity: number
          sold_quantity: number
        }[]
      }
      get_mcn_drop_order_counts: {
        Args: { p_drop_ids: string[] }
        Returns: {
          drop_id: string
          item_count: number
          order_count: number
        }[]
      }
      get_my_block_id: { Args: never; Returns: string }
      get_my_community_funds_overview: {
        Args: never
        Returns: {
          active_funds_count: number
          funds_contributed_to: number
          total_available: number
          total_collected: number
          total_spent: number
          your_total_contributed: number
        }[]
      }
      get_my_due_soon_count: { Args: never; Returns: number }
      get_my_provider_history: {
        Args: { p_provider_id: string }
        Returns: {
          created_at: string
          hire_id: string
          note: string
          signal: string
        }[]
      }
      get_my_recent_service_history: {
        Args: { p_limit?: number }
        Returns: {
          cost_paid: number
          created_at: string
          id: string
          note: string
          provider_id: string
          provider_name: string
          provider_name_snapshot: string
          service_id: string
          service_name: string
          serviced_on: string
        }[]
      }
      get_my_requested_community: {
        Args: never
        Returns: {
          block_label: string
          blocks_enabled: boolean
          code: string
          id: string
          name: string
        }[]
      }
      get_my_upcoming_services: {
        Args: never
        Returns: {
          category: string
          community_id: string
          created_at: string
          days_until_due: number
          frequency_months: number
          id: string
          images: Json
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
      get_public_host_profiles: {
        Args: { p_user_ids: string[] }
        Returns: {
          avatar_url: string
          flat_number: string
          full_name: string
          id: string
        }[]
      }
      get_residents_directory: {
        Args: { p_include_phone?: boolean }
        Returns: {
          app_role: Database["public"]["Enums"]["app_role_type"]
          block_id: string
          block_name: string
          flat_number: string
          full_name: string
          id: string
          phone_number: string
        }[]
      }
      get_service_history: {
        Args: { p_service_id: string }
        Returns: {
          cost_paid: number
          created_at: string
          id: string
          note: string
          provider_id: string
          provider_name: string
          provider_name_snapshot: string
          service_id: string
          serviced_on: string
        }[]
      }
      get_user_community_id: { Args: never; Returns: string }
      get_user_partner_community_ids: {
        Args: { p_capability?: string; p_user_id?: string }
        Returns: string[]
      }
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
      is_blocks_enabled: { Args: { p_community_id: string }; Returns: boolean }
      is_channel_muted: {
        Args: { p_channel: string; p_user_id: string }
        Returns: boolean
      }
      is_community_lead: { Args: { p_user_id?: string }; Returns: boolean }
      is_event_organizer: { Args: { p_user_id?: string }; Returns: boolean }
      is_funds_enabled: { Args: { p_community_id: string }; Returns: boolean }
      is_platform_admin: { Args: { p_user_id?: string }; Returns: boolean }
      is_user_approved: { Args: { p_user_id?: string }; Returns: boolean }
      join_community_by_code: { Args: { p_code: string }; Returns: Json }
      list_collection_targets_for_collector: {
        Args: { p_event_id: string }
        Returns: {
          block_id: string
          block_name: string
          contributed_amount: number
          contribution_id: string
          flat_id: string
          flat_label: string
          flat_number: string
          floor_label: string
          has_contributed: boolean
          occupant_name: string
          resident_count: number
          resident_name: string
          resident_user_id: string
        }[]
      }
      list_community_blocks: {
        Args: { p_community_id: string }
        Returns: {
          archived_at: string | null
          community_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "community_blocks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_community_flats: {
        Args: { p_block_id?: string; p_community_id: string }
        Returns: {
          block_id: string
          block_name: string
          flat_number: string
          floor_label: string
          id: string
          resident_count: number
        }[]
      }
      list_eligible_contributors_for_collector: {
        Args: { p_event_id: string }
        Returns: {
          block_id: string
          block_name: string
          flat_no: string
          full_name: string
          has_contributed: boolean
          user_id: string
        }[]
      }
      list_partner_communities: {
        Args: never
        Returns: {
          community_id: string
          community_name: string
          partnership_id: string
          scope: Json
          status: string
        }[]
      }
      list_pending_flat_addition_requests: {
        Args: { p_community_id: string }
        Returns: {
          block_id: string
          block_name: string
          community_id: string
          created_at: string
          flat_number: string
          id: string
          requested_by: string
          requester_name: string
          requester_phone: string
        }[]
      }
      list_visible_providers: {
        Args: {
          p_category?: string
          p_communities?: string[]
          p_search?: string
        }
        Returns: {
          avg_rating: number
          category: string
          created_at: string
          description: string
          flat_block: string
          id: string
          is_own_community: boolean
          is_verified: boolean
          name: string
          origin_community_id: string
          origin_community_name: string
          phone: string
          rating_count: number
          visibility: string
        }[]
      }
      mark_public_rating_nudge: {
        Args: { p_outcome: string; p_provider_id: string }
        Returns: {
          nudged_at: string
          outcome: string | null
          provider_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "provider_public_rating_nudges"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_service_done: {
        Args: {
          p_cost_paid?: number
          p_note?: string
          p_provider_id?: string
          p_service_id: string
        }
        Returns: {
          category: string
          community_id: string | null
          created_at: string
          frequency_months: number
          id: string
          images: Json
          last_serviced_on: string
          next_due_on: string
          notes: string | null
          notified_at: string | null
          notify_count: number
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
      place_mcn_order: {
        Args: {
          p_buyer_note?: string
          p_buyer_phone: string
          p_items: Json
          p_listing_id: string
          p_order_id?: string
        }
        Returns: string
      }
      place_mcn_preorder: {
        Args: {
          p_buyer_name: string
          p_buyer_note?: string
          p_buyer_phone: string
          p_drop_id: string
          p_flat_number: string
          p_items: Json
          p_order_id?: string
        }
        Returns: string
      }
      platform_add_community_block: {
        Args: { p_community_id: string; p_name: string }
        Returns: {
          archived_at: string | null
          community_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "community_blocks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_add_community_flats: {
        Args: {
          p_block_id: string
          p_community_id: string
          p_flat_numbers: string[]
        }
        Returns: number
      }
      platform_approve_community_request:
        | { Args: { p_request_id: string }; Returns: string }
        | {
            Args: {
              p_block_label?: string
              p_block_names?: string[]
              p_flats?: Json
              p_request_id: string
            }
            Returns: string
          }
      platform_approve_funds_access_request: {
        Args: { p_lead_user_id: string; p_request_id: string }
        Returns: undefined
      }
      platform_archive_community_block: {
        Args: { p_block_id: string }
        Returns: undefined
      }
      platform_archive_community_flat: {
        Args: { p_flat_id: string }
        Returns: undefined
      }
      platform_assign_block_in_charge: {
        Args: { p_block_id: string; p_event_id: string; p_user_id: string }
        Returns: {
          assigned_by: string
          block_id: string | null
          created_at: string | null
          event_id: string
          id: string
          role: string
          updated_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "fund_roles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_delete_service_provider: {
        Args: { p_provider_id: string }
        Returns: boolean
      }
      platform_delete_user: {
        Args: { p_reason?: string; p_target_user_id: string }
        Returns: undefined
      }
      platform_get_activity_trend: {
        Args: { p_community_id?: string; p_days?: number }
        Returns: {
          active_users: number
          contributions: number
          day: string
          orders: number
          signups: number
        }[]
      }
      platform_get_all_providers: {
        Args: { p_community_id?: string; p_search?: string }
        Returns: {
          avg_rating: number
          category: string
          community_id: string
          community_name: string
          fraud_status: string
          id: string
          is_verified: boolean
          name: string
          phone: string
          rating_count: number
          report_count: number
        }[]
      }
      platform_get_business_categories: {
        Args: { p_community_id?: string }
        Returns: {
          active_count: number
          avg_rating: number
          category_emoji: string
          category_id: string
          category_name: string
          listing_count: number
          owner_count: number
          product_count: number
          rating_count: number
        }[]
      }
      platform_get_business_owners: {
        Args: { p_community_id?: string }
        Returns: {
          avg_rating: number
          categories: string
          community_id: string
          community_name: string
          first_listing_at: string
          flagged_count: number
          listings_active: number
          listings_total: number
          owner_email: string
          owner_flat: string
          owner_id: string
          owner_name: string
          products_total: number
          rating_count: number
        }[]
      }
      platform_get_communities_overview: {
        Args: never
        Returns: {
          area: string
          balance: number
          blocks_enabled: boolean
          city: string
          code: string
          collected: number
          community_type: string
          created_at: string
          drops: number
          events: number
          food_revenue: number
          funds: number
          funds_enabled: boolean
          id: string
          last_activity_at: string
          leads: number
          listings: number
          mau_30d: number
          members: number
          name: string
          new_members_30d: number
          orders: number
          organizers: number
          pincode: string
          providers: number
          spent: number
        }[]
      }
      platform_get_community_businesses: {
        Args: { p_community_id: string }
        Returns: {
          avg_rating: number
          category_emoji: string
          category_name: string
          contact_phone: string
          created_at: string
          description: string
          image_url: string
          is_active: boolean
          listing_id: string
          name: string
          owner_flat: string
          owner_name: string
          product_count: number
          rating_count: number
        }[]
      }
      platform_get_community_dashboard: {
        Args: { p_community_id: string }
        Returns: {
          hires_past_30d: number
          orders_fulfilled: number
          orders_pending: number
          total_collected: number
          total_funds: number
          total_hires: number
          total_listings: number
          total_mcn_orders: number
          total_mcn_posts: number
          total_providers: number
          total_residents: number
          total_spent: number
          visits_cancelled: number
          visits_completed: number
          visits_past_30d: number
          visits_planned: number
        }[]
      }
      platform_get_community_dashboard_v2: {
        Args: { p_community_id?: string }
        Returns: {
          active_businesses: number
          active_food_drops: number
          dau_today: number
          hires_past_30d: number
          mau_30d: number
          total_business_products: number
          total_businesses: number
          total_collected: number
          total_food_drops: number
          total_food_revenue: number
          total_funds: number
          total_hires: number
          total_preorders: number
          total_providers: number
          total_residents: number
          total_spent: number
          visits_completed: number
          visits_past_30d: number
          visits_planned: number
        }[]
      }
      platform_get_community_dashboard_v3: {
        Args: { p_community_id?: string }
        Returns: {
          active_businesses: number
          active_food_drops: number
          active_funds: number
          avg_provider_rating: number
          cancelled_events: number
          contributing_residents: number
          dau_today: number
          distinct_business_owners: number
          distinct_food_buyers: number
          distinct_food_hosts: number
          hires_past_30d: number
          mau_30d: number
          new_residents_30d: number
          total_business_products: number
          total_businesses: number
          total_collected: number
          total_communities: number
          total_event_organizers: number
          total_events: number
          total_food_drops: number
          total_food_revenue: number
          total_funds: number
          total_hires: number
          total_preorders: number
          total_providers: number
          total_ratings: number
          total_residents: number
          total_spent: number
          upcoming_events: number
          visits_completed: number
          visits_past_30d: number
          visits_planned: number
          wau_7d: number
        }[]
      }
      platform_get_community_events: {
        Args: { p_community_id?: string }
        Returns: {
          cancellation_note: string
          cancelled_at: string
          category: string
          community_id: string
          community_name: string
          contact_count: number
          contacts: Json
          created_at: string
          description: string
          end_time: string
          entry_fee: number
          event_date: string
          event_id: string
          image_url: string
          poster_flat: string
          poster_id: string
          poster_name: string
          poster_role: string
          registration_last_date: string
          registration_link: string
          start_time: string
          status: string
          title: string
          venue: string
        }[]
      }
      platform_get_community_funds: {
        Args: { p_community_id: string }
        Returns: {
          balance: number
          collectors: Json
          contributions: Json
          created_at: string
          description: string
          expense: number
          id: string
          income: number
          is_closed: boolean
          title: string
          treasurers: Json
        }[]
      }
      platform_get_community_preorders: {
        Args: { p_community_id: string }
        Returns: {
          created_at: string
          creator_flat: string
          creator_name: string
          cutoff_at: string
          description: string
          drop_id: string
          fulfillment_date: string
          fulfillment_time: string
          image_url: string
          orders_count: number
          status: string
          title: string
          total_revenue: number
        }[]
      }
      platform_get_community_residents: {
        Args: { p_community_id: string }
        Returns: {
          app_role: Database["public"]["Enums"]["app_role_type"]
          block_id: string
          community_id: string
          created_at: string
          email: string
          flat_number: string
          full_name: string
          id: string
          phone_number: string
          removed_at: string
        }[]
      }
      platform_get_event_organizers: {
        Args: { p_community_id?: string }
        Returns: {
          app_role: string
          community_id: string
          community_name: string
          created_at: string
          email: string
          events_posted: number
          flat_number: string
          full_name: string
          grant_id: string
          granted_by_name: string
          user_id: string
        }[]
      }
      platform_get_feedback_reports: {
        Args: { p_community_id?: string; p_kind?: string }
        Returns: {
          community_id: string
          community_name: string
          created_at: string
          flat_number: string
          id: string
          image_url: string
          kind: string
          message: string
          resident_email: string
          resident_name: string
          resident_phone: string
          user_id: string
        }[]
      }
      platform_get_fund_collection_coverage: {
        Args: { p_event_id: string }
        Returns: {
          block_id: string
          block_name: string
          collected: number
          contributors: number
          residents: number
        }[]
      }
      platform_get_fund_ledger: {
        Args: { p_event_id: string }
        Returns: {
          amount: number
          category: string
          contributor_block: string
          contributor_flat: string
          contributor_id: string
          contributor_name: string
          created_at: string
          description: string
          entry_kind: string
          image_url: string
          recorded_by_name: string
          running_balance: number
          sponsor_name: string
          sponsor_note: string
          sponsor_phone: string
          title: string
          transaction_id: string
          type: string
        }[]
      }
      platform_get_preorder_hosts: {
        Args: { p_community_id?: string }
        Returns: {
          avg_order_value: number
          community_id: string
          community_name: string
          distinct_buyers: number
          drops_open: number
          drops_total: number
          first_drop_at: string
          host_email: string
          host_flat: string
          host_id: string
          host_name: string
          last_drop_at: string
          orders_total: number
          revenue_total: number
        }[]
      }
      platform_get_profiles_contact: {
        Args: { p_ids: string[] }
        Returns: {
          email: string
          full_name: string
          id: string
          phone_number: string
        }[]
      }
      platform_get_provider_details: {
        Args: { p_provider_id: string }
        Returns: Json
      }
      platform_get_providers_by_category: {
        Args: { p_community_id?: string }
        Returns: {
          category: string
          provider_count: number
          top_providers: Json
        }[]
      }
      platform_get_resident_details: {
        Args: { p_profile_id: string }
        Returns: Json
      }
      platform_reject_community_request: {
        Args: { p_rejection_reason?: string; p_request_id: string }
        Returns: undefined
      }
      platform_reject_funds_access_request: {
        Args: { p_rejection_reason: string; p_request_id: string }
        Returns: undefined
      }
      platform_remove_block_in_charge: {
        Args: { p_event_id: string; p_user_id: string }
        Returns: undefined
      }
      platform_remove_community_lead: {
        Args: { p_target_user_id: string }
        Returns: undefined
      }
      platform_remove_event_organizer: {
        Args: { p_community_id: string; p_target_user_id: string }
        Returns: undefined
      }
      platform_remove_resident_from_community: {
        Args: { p_reason?: string; p_target_profile_id: string }
        Returns: undefined
      }
      platform_resolve_provider_report: {
        Args: { p_report_id: string; p_status: string }
        Returns: undefined
      }
      platform_revoke_funds_access: {
        Args: { p_community_id: string; p_revoke_reason: string }
        Returns: undefined
      }
      platform_seed_community_flats: {
        Args: {
          p_block_label?: string
          p_community_id: string
          p_payload: Json
        }
        Returns: {
          blocks_created: number
          flats_created: number
        }[]
      }
      platform_set_block_label: {
        Args: { p_community_id: string; p_label: string }
        Returns: undefined
      }
      platform_set_blocks_enabled: {
        Args: { p_community_id: string; p_enabled: boolean }
        Returns: undefined
      }
      platform_set_community_lead: {
        Args: {
          p_community_id: string
          p_role: string
          p_target_user_id: string
        }
        Returns: undefined
      }
      platform_set_event_organizer: {
        Args: { p_community_id: string; p_target_user_id: string }
        Returns: undefined
      }
      platform_set_flat_occupant_names: {
        Args: { p_community_id: string; p_rows: Json }
        Returns: {
          matched: number
          unmatched: string[]
        }[]
      }
      platform_set_fund_treasurer: {
        Args: { p_event_id: string; p_target_user_id: string }
        Returns: undefined
      }
      platform_soft_remove_resident: {
        Args: { p_reason?: string; p_target_profile_id: string }
        Returns: undefined
      }
      record_hire_feedback: {
        Args: { p_hire_id: string; p_note?: string; p_signal: string }
        Returns: {
          created_at: string
          hire_id: string
          id: string
          note: string | null
          provider_id: string
          signal: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "hire_feedback"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_block_in_charge: {
        Args: { p_event_id: string; p_user_id: string }
        Returns: undefined
      }
      rename_community_block: {
        Args: { p_block_id: string; p_new_name: string }
        Returns: {
          archived_at: string | null
          community_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "community_blocks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_community_partnership: {
        Args: { p_scope?: Json; p_target_community_id: string }
        Returns: string
      }
      request_flat_addition: {
        Args: { p_block_id: string; p_flat_number: string }
        Returns: Json
      }
      review_flat_addition: {
        Args: { p_approve: boolean; p_reason?: string; p_request_id: string }
        Returns: Json
      }
      set_audit_actor: { Args: { p_actor_id: string }; Returns: undefined }
      set_audit_context: {
        Args: { p_actor_id: string; p_reason?: string }
        Returns: undefined
      }
      set_community_blocks_enabled: {
        Args: { p_enabled: boolean }
        Returns: undefined
      }
      set_fund_closed: {
        Args: { p_closed: boolean; p_event_id: string }
        Returns: {
          community_id: string
          created_at: string | null
          created_by: string
          description: string | null
          event_date: string
          fund_scope: string
          goal_amount: number | null
          group_id: string | null
          id: string
          is_closed: boolean | null
          partnership_id: string | null
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_my_block: {
        Args: { p_block_id: string }
        Returns: {
          app_role: Database["public"]["Enums"]["app_role_type"]
          avatar_url: string | null
          block_id: string | null
          community_id: string | null
          created_at: string | null
          email: string | null
          expo_push_token: string | null
          flat_id: string | null
          flat_number: string | null
          full_name: string | null
          id: string
          last_active_at: string | null
          phone_number: string | null
          removed_at: string | null
          removed_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_my_flat: { Args: { p_flat_id: string }; Returns: undefined }
      set_partnership_status: {
        Args: { p_partnership_id: string; p_status: string }
        Returns: undefined
      }
      set_provider_moderation_state: {
        Args: {
          p_fraud_status?: string
          p_is_verified?: boolean
          p_provider_id: string
        }
        Returns: undefined
      }
      set_provider_visibility: {
        Args: { p_provider_id: string; p_targets?: Json; p_visibility: string }
        Returns: undefined
      }
      set_resident_block: {
        Args: { p_block_id: string; p_resident_id: string }
        Returns: {
          app_role: Database["public"]["Enums"]["app_role_type"]
          avatar_url: string | null
          block_id: string | null
          community_id: string | null
          created_at: string | null
          email: string | null
          expo_push_token: string | null
          flat_id: string | null
          flat_number: string | null
          full_name: string | null
          id: string
          last_active_at: string | null
          phone_number: string | null
          removed_at: string | null
          removed_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      should_show_public_rating_nudge: {
        Args: { p_provider_id: string }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_community_request: {
        Args: {
          p_address?: string
          p_approximate_units?: string
          p_area?: string
          p_block_details?: Json
          p_block_label?: string
          p_city: string
          p_community_type?: string
          p_name: string
          p_pincode: string
          p_proof_photo_url?: string
          p_requester_flat_number?: string
        }
        Returns: string
      }
      submit_funds_access_request: {
        Args: {
          p_contact_name: string
          p_contact_phone: string
          p_purpose?: string
        }
        Returns: string
      }
      today_ist: { Args: never; Returns: string }
      touch_last_active: { Args: never; Returns: undefined }
      upsert_community_event: {
        Args: {
          p_category: string
          p_contacts: Json
          p_description: string
          p_end_time: string
          p_entry_fee: number
          p_event_date: string
          p_event_id: string
          p_image_url: string
          p_registration_last_date: string
          p_registration_link: string
          p_start_time: string
          p_title: string
          p_venue: string
        }
        Returns: string
      }
      withdraw_funds_access_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role_type: "admin" | "resident" | "president" | "vice_president"
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
      app_role_type: ["admin", "resident", "president", "vice_president"],
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

// ---------------------------------------------------------------------------
// HAND-MAINTAINED — everything above this line is generated, this block is not.
//
// `npm run types:preprod` / `types:prod` redirect over the whole file, so a
// regen silently deletes the four types below and `npx tsc --noEmit` then
// fails across ~8 unrelated screens. Re-append this block after every regen.
// See docs/CLAUDE.md §6 step 3.
// ---------------------------------------------------------------------------

/**
 * A profile as the **app** can actually read it.
 *
 * `Tables<'profiles'>` describes the table, and the table has an `email`
 * column — but `20260918000000` revoked column read access to it from
 * `authenticated` and `anon` so that no resident can read another resident's
 * address. Selecting it fails, so no client type should claim to have it.
 *
 * Your own email comes from the auth session (`useAuth().user.email`).
 */
export type ResidentProfile = Omit<Tables<'profiles'>, 'email'>

export type ProviderWithInteraction = Tables<'service_providers'> & {
  is_favorite?: boolean
  hire_count?: number
  user_rating?: number | null
}

export type VisitWithJoinerData = Tables<'service_visits'> & {
  creator_name?: string | null
  creator_flat?: string | null
  creator_avatar_url?: string | null
  joiner_count?: number
  has_user_joined?: boolean
}

export type VisitJoinerWithProfile = Tables<'visit_joiners'> & {
  user_name?: string | null
  full_name?: string | null
  avatar_url?: string | null
  flat_number?: string | null
  joined_at?: string
}
