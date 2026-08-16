// GERADO pelo Supabase a partir do schema real. Nao edite na mao.
// Para regerar: node supabase/aplicar-sql.mjs --tipos

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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      amenities: {
        Row: {
          created_at: string
          icon: string
          id: string
          is_active: boolean
          label: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon: string
          id?: string
          is_active?: boolean
          label: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          label?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      appointment_services: {
        Row: {
          appointment_id: string
          duration_minutes: number
          id: string
          price: number
          service_id: string
        }
        Insert: {
          appointment_id: string
          duration_minutes?: number
          id?: string
          price?: number
          service_id: string
        }
        Update: {
          appointment_id?: string
          duration_minutes?: number
          id?: string
          price?: number
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_services_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          barbershop_id: string
          cancel_reason: string | null
          cancelled_by: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          dependent_id: string | null
          discount: number
          ends_at: string
          id: string
          notes: string | null
          professional_id: string
          public_token: string | null
          reminder_sent_at: string | null
          source: Database["public"]["Enums"]["appointment_source"]
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          total_price: number
        }
        Insert: {
          barbershop_id: string
          cancel_reason?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          dependent_id?: string | null
          discount?: number
          ends_at: string
          id?: string
          notes?: string | null
          professional_id: string
          public_token?: string | null
          reminder_sent_at?: string | null
          source?: Database["public"]["Enums"]["appointment_source"]
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          total_price?: number
        }
        Update: {
          barbershop_id?: string
          cancel_reason?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          dependent_id?: string | null
          discount?: number
          ends_at?: string
          id?: string
          notes?: string | null
          professional_id?: string
          public_token?: string | null
          reminder_sent_at?: string | null
          source?: Database["public"]["Enums"]["appointment_source"]
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          total_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "appointments_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_dependent_id_fkey"
            columns: ["dependent_id"]
            isOneToOne: false
            referencedRelation: "dependents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      barbershop_amenities: {
        Row: {
          amenity_id: string
          barbershop_id: string
          created_at: string
        }
        Insert: {
          amenity_id: string
          barbershop_id: string
          created_at?: string
        }
        Update: {
          amenity_id?: string
          barbershop_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "barbershop_amenities_amenity_id_fkey"
            columns: ["amenity_id"]
            isOneToOne: false
            referencedRelation: "amenities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barbershop_amenities_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      barbershops: {
        Row: {
          accepts_online_booking: boolean
          allow_public_booking: boolean
          cancel_deadline_hours: number
          city: string | null
          complement: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          max_advance_days: number
          min_advance_minutes: number
          name: string
          neighborhood: string | null
          number: string | null
          owner_id: string
          phone: string | null
          rating_avg: number
          rating_count: number
          slug: string
          state: string | null
          street: string | null
          whatsapp: string | null
          zip_code: string | null
        }
        Insert: {
          accepts_online_booking?: boolean
          allow_public_booking?: boolean
          cancel_deadline_hours?: number
          city?: string | null
          complement?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          max_advance_days?: number
          min_advance_minutes?: number
          name: string
          neighborhood?: string | null
          number?: string | null
          owner_id: string
          phone?: string | null
          rating_avg?: number
          rating_count?: number
          slug: string
          state?: string | null
          street?: string | null
          whatsapp?: string | null
          zip_code?: string | null
        }
        Update: {
          accepts_online_booking?: boolean
          allow_public_booking?: boolean
          cancel_deadline_hours?: number
          city?: string | null
          complement?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          max_advance_days?: number
          min_advance_minutes?: number
          name?: string
          neighborhood?: string | null
          number?: string | null
          owner_id?: string
          phone?: string | null
          rating_avg?: number
          rating_count?: number
          slug?: string
          state?: string | null
          street?: string | null
          whatsapp?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barbershops_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          barbershop_id: string
          break_end: string | null
          break_start: string | null
          closes_at: string | null
          id: string
          is_closed: boolean
          opens_at: string | null
          weekday: number
        }
        Insert: {
          barbershop_id: string
          break_end?: string | null
          break_start?: string | null
          closes_at?: string | null
          id?: string
          is_closed?: boolean
          opens_at?: string | null
          weekday: number
        }
        Update: {
          barbershop_id?: string
          break_end?: string | null
          break_start?: string | null
          closes_at?: string | null
          id?: string
          is_closed?: boolean
          opens_at?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_payments: {
        Row: {
          amount: number
          barbershop_id: string
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string | null
          paid_at: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          professional_id: string
          transaction_id: string | null
        }
        Insert: {
          amount: number
          barbershop_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          paid_at?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          professional_id: string
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          barbershop_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          paid_at?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          professional_id?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_payments_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_payments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          amount: number
          appointment_id: string
          barbershop_id: string
          base_amount: number
          created_at: string
          id: string
          paid_amount: number
          paid_at: string | null
          payment_id: string | null
          percent: number
          professional_id: string
          status: Database["public"]["Enums"]["commission_status"]
        }
        Insert: {
          amount?: number
          appointment_id: string
          barbershop_id: string
          base_amount?: number
          created_at?: string
          id?: string
          paid_amount?: number
          paid_at?: string | null
          payment_id?: string | null
          percent?: number
          professional_id: string
          status?: Database["public"]["Enums"]["commission_status"]
        }
        Update: {
          amount?: number
          appointment_id?: string
          barbershop_id?: string
          base_amount?: number
          created_at?: string
          id?: string
          paid_amount?: number
          paid_at?: string | null
          payment_id?: string | null
          percent?: number
          professional_id?: string
          status?: Database["public"]["Enums"]["commission_status"]
        }
        Relationships: [
          {
            foreignKeyName: "commissions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "commission_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          barbershop_id: string
          birth_date: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_walk_in: boolean
          last_visit_at: string | null
          no_show_count: number
          notes: string | null
          phone: string | null
          profile_id: string | null
          total_spent: number
          total_visits: number
        }
        Insert: {
          barbershop_id: string
          birth_date?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_walk_in?: boolean
          last_visit_at?: string | null
          no_show_count?: number
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          total_spent?: number
          total_visits?: number
        }
        Update: {
          barbershop_id?: string
          birth_date?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_walk_in?: boolean
          last_visit_at?: string | null
          no_show_count?: number
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          total_spent?: number
          total_visits?: number
        }
        Relationships: [
          {
            foreignKeyName: "customers_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      debt_payments: {
        Row: {
          amount: number
          created_by: string | null
          debt_id: string
          id: string
          paid_at: string
          payment_method: Database["public"]["Enums"]["payment_method"]
        }
        Insert: {
          amount: number
          created_by?: string | null
          debt_id: string
          id?: string
          paid_at?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
        }
        Update: {
          amount?: number
          created_by?: string | null
          debt_id?: string
          id?: string
          paid_at?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
        }
        Relationships: [
          {
            foreignKeyName: "debt_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_payments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
        ]
      }
      debts: {
        Row: {
          appointment_id: string | null
          barbershop_id: string
          created_at: string
          customer_id: string
          due_date: string | null
          id: string
          original_amount: number
          paid_amount: number
          status: Database["public"]["Enums"]["debt_status"]
        }
        Insert: {
          appointment_id?: string | null
          barbershop_id: string
          created_at?: string
          customer_id: string
          due_date?: string | null
          id?: string
          original_amount: number
          paid_amount?: number
          status?: Database["public"]["Enums"]["debt_status"]
        }
        Update: {
          appointment_id?: string | null
          barbershop_id?: string
          created_at?: string
          customer_id?: string
          due_date?: string | null
          id?: string
          original_amount?: number
          paid_amount?: number
          status?: Database["public"]["Enums"]["debt_status"]
        }
        Relationships: [
          {
            foreignKeyName: "debts_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      dependents: {
        Row: {
          birth_date: string | null
          created_at: string
          full_name: string
          id: string
          notes: string | null
          profile_id: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          full_name: string
          id?: string
          notes?: string | null
          profile_id: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          full_name?: string
          id?: string
          notes?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dependents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          barbershop_id: string
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          barbershop_id: string
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          barbershop_id?: string
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          profile_id: string
          read_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          profile_id: string
          read_at?: string | null
          title: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          profile_id?: string
          read_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_schedules: {
        Row: {
          ends_at: string | null
          id: string
          is_off: boolean
          professional_id: string
          starts_at: string | null
          weekday: number
        }
        Insert: {
          ends_at?: string | null
          id?: string
          is_off?: boolean
          professional_id: string
          starts_at?: string | null
          weekday: number
        }
        Update: {
          ends_at?: string | null
          id?: string
          is_off?: boolean
          professional_id?: string
          starts_at?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "professional_schedules_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          avatar_url: string | null
          barbershop_id: string
          bio: string | null
          commission_percent: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          nickname: string | null
          profile_id: string | null
          sort_order: number
        }
        Insert: {
          avatar_url?: string | null
          barbershop_id: string
          bio?: string | null
          commission_percent?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          nickname?: string | null
          profile_id?: string | null
          sort_order?: number
        }
        Update: {
          avatar_url?: string | null
          barbershop_id?: string
          bio?: string | null
          commission_percent?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          nickname?: string | null
          profile_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "professionals_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professionals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          barbershop_id: string | null
          birth_date: string | null
          created_at: string
          email: string | null
          full_name: string | null
          gender: string | null
          id: string
          is_platform_admin: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          avatar_url?: string | null
          barbershop_id?: string | null
          birth_date?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id: string
          is_platform_admin?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          avatar_url?: string | null
          barbershop_id?: string | null
          birth_date?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          is_platform_admin?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          appointment_id: string
          barbershop_id: string
          comment: string | null
          created_at: string
          id: string
          professional_id: string | null
          profile_id: string
          rating: number
          replied_at: string | null
          reply: string | null
        }
        Insert: {
          appointment_id: string
          barbershop_id: string
          comment?: string | null
          created_at?: string
          id?: string
          professional_id?: string | null
          profile_id: string
          rating: number
          replied_at?: string | null
          reply?: string | null
        }
        Update: {
          appointment_id?: string
          barbershop_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          professional_id?: string | null
          profile_id?: string
          rating?: number
          replied_at?: string | null
          reply?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          barbershop_id: string
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          barbershop_id: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name: string
          price?: number
          sort_order?: number
        }
        Update: {
          barbershop_id?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "services_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_visits: {
        Row: {
          barbershop_id: string
          id: string
          last_viewed_at: string
          profile_id: string
        }
        Insert: {
          barbershop_id: string
          id?: string
          last_viewed_at?: string
          profile_id: string
        }
        Update: {
          barbershop_id?: string
          id?: string
          last_viewed_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_visits_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_visits_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_off: {
        Row: {
          barbershop_id: string
          created_at: string
          ends_at: string
          id: string
          professional_id: string | null
          reason: string | null
          starts_at: string
        }
        Insert: {
          barbershop_id: string
          created_at?: string
          ends_at: string
          id?: string
          professional_id?: string | null
          reason?: string | null
          starts_at: string
        }
        Update: {
          barbershop_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          professional_id?: string | null
          reason?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          appointment_id: string | null
          barbershop_id: string
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          occurred_at: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          barbershop_id: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          occurred_at?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          barbershop_id?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          occurred_at?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "transactions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_addresses: {
        Row: {
          city: string | null
          complement: string | null
          country: string
          created_at: string
          id: string
          is_default: boolean
          neighborhood: string | null
          number: string | null
          profile_id: string
          state: string | null
          street: string | null
          zip_code: string | null
        }
        Insert: {
          city?: string | null
          complement?: string | null
          country?: string
          created_at?: string
          id?: string
          is_default?: boolean
          neighborhood?: string | null
          number?: string | null
          profile_id: string
          state?: string | null
          street?: string | null
          zip_code?: string | null
        }
        Update: {
          city?: string | null
          complement?: string | null
          country?: string
          created_at?: string
          id?: string
          is_default?: boolean
          neighborhood?: string | null
          number?: string | null
          profile_id?: string
          state?: string | null
          street?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_addresses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_entries: {
        Row: {
          barbershop_id: string
          created_at: string
          desired_date: string
          id: string
          notified_at: string | null
          period: string
          professional_id: string | null
          profile_id: string
          service_id: string | null
          status: Database["public"]["Enums"]["waitlist_status"]
        }
        Insert: {
          barbershop_id: string
          created_at?: string
          desired_date: string
          id?: string
          notified_at?: string | null
          period?: string
          professional_id?: string | null
          profile_id: string
          service_id?: string | null
          status?: Database["public"]["Enums"]["waitlist_status"]
        }
        Update: {
          barbershop_id?: string
          created_at?: string
          desired_date?: string
          id?: string
          notified_at?: string | null
          period?: string
          professional_id?: string | null
          profile_id?: string
          service_id?: string | null
          status?: Database["public"]["Enums"]["waitlist_status"]
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      walk_in_counters: {
        Row: {
          barbershop_id: string
          dia: string
          ultimo: number
        }
        Insert: {
          barbershop_id: string
          dia: string
          ultimo?: number
        }
        Update: {
          barbershop_id?: string
          dia?: string
          ultimo?: number
        }
        Relationships: [
          {
            foreignKeyName: "walk_in_counters_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      book_appointment: {
        Args: {
          p_dependent?: string
          p_nome?: string
          p_obs?: string
          p_professional: string
          p_profile?: string
          p_quando: string
          p_service_ids: string[]
          p_shop: string
          p_source?: Database["public"]["Enums"]["appointment_source"]
          p_telefone?: string
        }
        Returns: string
      }
      can_manage_money: { Args: { shop: string }; Returns: boolean }
      cancel_appointment: {
        Args: { p_appointment: string; p_motivo?: string; p_por_quem?: string }
        Returns: string
      }
      client_home: { Args: { p_profile?: string }; Returns: Json }
      complete_appointment: {
        Args: {
          p_appointment: string
          p_desconto?: number
          p_pagamentos: Json
          p_vencimento?: string
        }
        Returns: string
      }
      agendamento_por_token: {
        Args: { p_token: string }
        Returns: {
          cancel_deadline_hours: number
          cliente_nome: string
          ends_at: string
          id: string
          profissional: string
          servicos: string
          shop_endereco: string
          shop_nome: string
          shop_slug: string
          shop_telefone: string
          shop_whatsapp: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          total_price: number
        }[]
      }
      book_appointment_publico: {
        Args: {
          p_ip_hash: string
          p_nome: string
          p_obs?: string
          p_professional: string
          p_quando: string
          p_service_ids: string[]
          p_shop: string
          p_telefone: string
        }
        Returns: Json
      }
      cancelar_por_token: {
        Args: { p_motivo?: string; p_token: string }
        Returns: boolean
      }
      complete_appointments_lote: {
        Args: { p_itens: Json }
        Returns: number
      }
      reverter_status_agendamento: {
        Args: { p_appointment: string }
        Returns: string
      }
      comissoes_do_dia: {
        Args: { p_dia?: string; p_shop: string }
        Returns: {
          atendimentos: number
          comissao: number
          nome: string
          percent: number
          professional_id: string
          total_gerado: number
        }[]
      }
      dashboard_summary: {
        Args: { p_ate?: string; p_de?: string; p_shop: string }
        Returns: Json
      }
      distancia_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      get_available_slots: {
        Args: { p_dia: string; p_duracao?: number; p_professional: string }
        Returns: {
          slot: string
        }[]
      }
      has_shop_access: { Args: { shop: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      join_waitlist: {
        Args: {
          p_dia?: string
          p_periodo?: string
          p_professional?: string
          p_service?: string
          p_shop: string
        }
        Returns: string
      }
      mark_no_show: { Args: { p_appointment: string }; Returns: string }
      my_shop_id: { Args: never; Returns: string }
      next_walk_in_number: { Args: { p_shop: string }; Returns: number }
      owns_customer: { Args: { p_customer: string }; Returns: boolean }
      pay_commissions: {
        Args: {
          p_forma?: Database["public"]["Enums"]["payment_method"]
          p_idem?: string
          p_professional: string
          p_valor: number
        }
        Returns: string
      }
      pay_debt: {
        Args: {
          p_debt: string
          p_forma?: Database["public"]["Enums"]["payment_method"]
          p_valor: number
        }
        Returns: string
      }
      pode_escrever_imagem: { Args: { p_nome: string }; Returns: boolean }
      proximo_nome_avulso: { Args: { p_shop: string }; Returns: string }
      public_reviews: {
        Args: { limite?: number; p_shop: string }
        Returns: {
          autor: string
          comment: string
          created_at: string
          id: string
          profissional: string
          rating: number
          replied_at: string
          reply: string
        }[]
      }
      revenue_series: {
        Args: { p_ate: string; p_de: string; p_shop: string }
        Returns: {
          despesa: number
          dia: string
          receita: number
        }[]
      }
      revert_commission_payment: {
        Args: { p_payment: string }
        Returns: string
      }
      search_barbershops: {
        Args: {
          cidade?: string
          lat?: number
          limite?: number
          lng?: number
          raio_km?: number
          termo?: string
        }
        Returns: {
          city: string
          cover_url: string
          description: string
          dist_km: number
          id: string
          logo_url: string
          name: string
          neighborhood: string
          rating_avg: number
          rating_count: number
          slug: string
          state: string
        }[]
      }
    }
    Enums: {
      appointment_source: "online" | "manual"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
      commission_status: "pending" | "partial" | "paid"
      debt_status: "open" | "partial" | "paid"
      notification_type:
        | "appointment"
        | "reminder"
        | "waitlist"
        | "review"
        | "system"
      payment_method: "cash" | "pix" | "debit" | "credit" | "fiado"
      transaction_type: "income" | "expense"
      user_role: "owner" | "assistant" | "client"
      waitlist_status: "waiting" | "notified" | "converted" | "expired"
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
      appointment_source: ["online", "manual"],
      appointment_status: [
        "scheduled",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
      ],
      commission_status: ["pending", "partial", "paid"],
      debt_status: ["open", "partial", "paid"],
      notification_type: [
        "appointment",
        "reminder",
        "waitlist",
        "review",
        "system",
      ],
      payment_method: ["cash", "pix", "debit", "credit", "fiado"],
      transaction_type: ["income", "expense"],
      user_role: ["owner", "assistant", "client"],
      waitlist_status: ["waiting", "notified", "converted", "expired"],
    },
  },
} as const
