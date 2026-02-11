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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      abandoned_carts: {
        Row: {
          cart_items: Json
          cart_total: number
          created_at: string
          customer_email: string | null
          id: string
          recovered_at: string | null
          reminder_count: number
          reminder_sent_at: string | null
          session_id: string
          updated_at: string
        }
        Insert: {
          cart_items?: Json
          cart_total?: number
          created_at?: string
          customer_email?: string | null
          id?: string
          recovered_at?: string | null
          reminder_count?: number
          reminder_sent_at?: string | null
          session_id: string
          updated_at?: string
        }
        Update: {
          cart_items?: Json
          cart_total?: number
          created_at?: string
          customer_email?: string | null
          id?: string
          recovered_at?: string | null
          reminder_count?: number
          reminder_sent_at?: string | null
          session_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      bestsellers: {
        Row: {
          created_at: string
          hero_headline: string | null
          hero_subheadline: string | null
          id: string
          is_active: boolean
          is_manual: boolean
          long_description: string | null
          meta_keywords: string[] | null
          product_id: string
          rank: number
          selling_points: Json | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hero_headline?: string | null
          hero_subheadline?: string | null
          id?: string
          is_active?: boolean
          is_manual?: boolean
          long_description?: string | null
          meta_keywords?: string[] | null
          product_id: string
          rank?: number
          selling_points?: Json | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hero_headline?: string | null
          hero_subheadline?: string | null
          id?: string
          is_active?: boolean
          is_manual?: boolean
          long_description?: string | null
          meta_keywords?: string[] | null
          product_id?: string
          rank?: number
          selling_points?: Json | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bestsellers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bestsellers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_cj_products: {
        Row: {
          blocked_at: string
          blocked_by: string | null
          cj_product_id: string
          id: string
          product_name: string | null
        }
        Insert: {
          blocked_at?: string
          blocked_by?: string | null
          cj_product_id: string
          id?: string
          product_name?: string | null
        }
        Update: {
          blocked_at?: string
          blocked_by?: string | null
          cj_product_id?: string
          id?: string
          product_name?: string | null
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author_name: string | null
          category: string
          content: string
          created_at: string
          excerpt: string
          featured_image: string | null
          id: string
          is_published: boolean | null
          meta_description: string | null
          meta_keywords: string[] | null
          meta_title: string | null
          published_at: string | null
          reading_time_minutes: number | null
          slug: string
          tags: string[] | null
          title: string
          updated_at: string
          view_count: number | null
        }
        Insert: {
          author_name?: string | null
          category?: string
          content: string
          created_at?: string
          excerpt: string
          featured_image?: string | null
          id?: string
          is_published?: boolean | null
          meta_description?: string | null
          meta_keywords?: string[] | null
          meta_title?: string | null
          published_at?: string | null
          reading_time_minutes?: number | null
          slug: string
          tags?: string[] | null
          title: string
          updated_at?: string
          view_count?: number | null
        }
        Update: {
          author_name?: string | null
          category?: string
          content?: string
          created_at?: string
          excerpt?: string
          featured_image?: string | null
          id?: string
          is_published?: boolean | null
          meta_description?: string | null
          meta_keywords?: string[] | null
          meta_title?: string | null
          published_at?: string | null
          reading_time_minutes?: number | null
          slug?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          view_count?: number | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          image_url: string | null
          name: string
          parent_id: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          image_url?: string | null
          name: string
          parent_id?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          image_url?: string | null
          name?: string
          parent_id?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      cj_product_bookmarks: {
        Row: {
          category_name: string | null
          cj_product_id: string
          created_at: string
          id: string
          product_image: string | null
          product_name: string
          product_sku: string | null
          product_weight: number | null
          sell_price: number | null
          user_id: string
        }
        Insert: {
          category_name?: string | null
          cj_product_id: string
          created_at?: string
          id?: string
          product_image?: string | null
          product_name: string
          product_sku?: string | null
          product_weight?: number | null
          sell_price?: number | null
          user_id: string
        }
        Update: {
          category_name?: string | null
          cj_product_id?: string
          created_at?: string
          id?: string
          product_image?: string | null
          product_name?: string
          product_sku?: string | null
          product_weight?: number | null
          sell_price?: number | null
          user_id?: string
        }
        Relationships: []
      }
      cj_token_cache: {
        Row: {
          access_token: string
          created_at: string
          id: string
          token_expiry: string
          updated_at: string
        }
        Insert: {
          access_token: string
          created_at?: string
          id?: string
          token_expiry: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          token_expiry?: string
          updated_at?: string
        }
        Relationships: []
      }
      cj_webhook_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string
          message_type: string
          payload: Json | null
          processed: boolean | null
          processed_at: string | null
          webhook_type: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id: string
          message_type: string
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          webhook_type: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string
          message_type?: string
          payload?: Json | null
          processed?: boolean | null
          processed_at?: string | null
          webhook_type?: string
        }
        Relationships: []
      }
      competitor_alerts: {
        Row: {
          alert_type: string
          competitor: string
          created_at: string
          data: Json | null
          description: string
          id: string
          is_dismissed: boolean
          is_read: boolean
          product_id: string | null
          product_name: string | null
          severity: string
          title: string
        }
        Insert: {
          alert_type: string
          competitor: string
          created_at?: string
          data?: Json | null
          description: string
          id?: string
          is_dismissed?: boolean
          is_read?: boolean
          product_id?: string | null
          product_name?: string | null
          severity?: string
          title: string
        }
        Update: {
          alert_type?: string
          competitor?: string
          created_at?: string
          data?: Json | null
          description?: string
          id?: string
          is_dismissed?: boolean
          is_read?: boolean
          product_id?: string | null
          product_name?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "competitor_products"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_analysis_reports: {
        Row: {
          competitors_analyzed: string[]
          created_at: string
          generated_by: string | null
          id: string
          insights: Json
          pricing_analysis: Json | null
          product_trends: Json | null
          products_analyzed: number
          recommendations: Json
          report_date: string
          report_type: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          competitors_analyzed?: string[]
          created_at?: string
          generated_by?: string | null
          id?: string
          insights?: Json
          pricing_analysis?: Json | null
          product_trends?: Json | null
          products_analyzed?: number
          recommendations?: Json
          report_date?: string
          report_type?: string
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          competitors_analyzed?: string[]
          created_at?: string
          generated_by?: string | null
          id?: string
          insights?: Json
          pricing_analysis?: Json | null
          product_trends?: Json | null
          products_analyzed?: number
          recommendations?: Json
          report_date?: string
          report_type?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      competitor_products: {
        Row: {
          category: string | null
          competitor: string
          created_at: string
          current_rank: number
          first_seen_at: string
          id: string
          last_seen_at: string
          previous_rank: number | null
          price: number | null
          product_image: string | null
          product_name: string
          product_url: string | null
          rank_change: number | null
          trend: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          competitor: string
          created_at?: string
          current_rank: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          previous_rank?: number | null
          price?: number | null
          product_image?: string | null
          product_name: string
          product_url?: string | null
          rank_change?: number | null
          trend?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          competitor?: string
          created_at?: string
          current_rank?: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          previous_rank?: number | null
          price?: number | null
          product_image?: string | null
          product_name?: string
          product_url?: string | null
          rank_change?: number | null
          trend?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      competitor_rankings: {
        Row: {
          competitor_domain: string
          created_at: string
          id: string
          keyword: string
          position: number | null
          tracked_date: string
        }
        Insert: {
          competitor_domain: string
          created_at?: string
          id?: string
          keyword: string
          position?: number | null
          tracked_date?: string
        }
        Update: {
          competitor_domain?: string
          created_at?: string
          id?: string
          keyword?: string
          position?: number | null
          tracked_date?: string
        }
        Relationships: []
      }
      competitor_scrape_logs: {
        Row: {
          competitor: string
          error_message: string | null
          id: string
          products_found: number | null
          scraped_at: string
          success: boolean
        }
        Insert: {
          competitor: string
          error_message?: string | null
          id?: string
          products_found?: number | null
          scraped_at?: string
          success?: boolean
        }
        Update: {
          competitor?: string
          error_message?: string | null
          id?: string
          products_found?: number | null
          scraped_at?: string
          success?: boolean
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          order_number: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          order_number?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          order_number?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      crawler_visits: {
        Row: {
          bot_type: string | null
          created_at: string
          id: string
          ip_address: string | null
          is_googlebot: boolean
          page_url: string
          referrer: string | null
          user_agent: string
        }
        Insert: {
          bot_type?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          is_googlebot?: boolean
          page_url: string
          referrer?: string | null
          user_agent: string
        }
        Update: {
          bot_type?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          is_googlebot?: boolean
          page_url?: string
          referrer?: string | null
          user_agent?: string
        }
        Relationships: []
      }
      cron_job_logs: {
        Row: {
          completed_at: string | null
          created_at: string
          details: Json | null
          error_message: string | null
          id: string
          items_failed: number | null
          items_processed: number | null
          job_name: string
          started_at: string
          status: string
          success: boolean | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          details?: Json | null
          error_message?: string | null
          id?: string
          items_failed?: number | null
          items_processed?: number | null
          job_name: string
          started_at?: string
          status?: string
          success?: boolean | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          details?: Json | null
          error_message?: string | null
          id?: string
          items_failed?: number | null
          items_processed?: number | null
          job_name?: string
          started_at?: string
          status?: string
          success?: boolean | null
        }
        Relationships: []
      }
      dedupe_conflicts: {
        Row: {
          canonical_price: number | null
          canonical_product_id: string | null
          created_at: string
          dedupe_key: string
          duplicate_price: number | null
          duplicate_product_id: string | null
          id: string
          price_diff_pct: number | null
          resolved: boolean
        }
        Insert: {
          canonical_price?: number | null
          canonical_product_id?: string | null
          created_at?: string
          dedupe_key: string
          duplicate_price?: number | null
          duplicate_product_id?: string | null
          id?: string
          price_diff_pct?: number | null
          resolved?: boolean
        }
        Update: {
          canonical_price?: number | null
          canonical_product_id?: string | null
          created_at?: string
          dedupe_key?: string
          duplicate_price?: number | null
          duplicate_product_id?: string | null
          id?: string
          price_diff_pct?: number | null
          resolved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "dedupe_conflicts_canonical_product_id_fkey"
            columns: ["canonical_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dedupe_conflicts_canonical_product_id_fkey"
            columns: ["canonical_product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dedupe_conflicts_duplicate_product_id_fkey"
            columns: ["duplicate_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dedupe_conflicts_duplicate_product_id_fkey"
            columns: ["duplicate_product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      discontinued_products: {
        Row: {
          created_at: string
          discontinued_at: string
          id: string
          product_name: string | null
          sku: string
          supplier: string
          vendor: string | null
        }
        Insert: {
          created_at?: string
          discontinued_at?: string
          id?: string
          product_name?: string | null
          sku: string
          supplier: string
          vendor?: string | null
        }
        Update: {
          created_at?: string
          discontinued_at?: string
          id?: string
          product_name?: string | null
          sku?: string
          supplier?: string
          vendor?: string | null
        }
        Relationships: []
      }
      dispute_messages: {
        Row: {
          attachments: Json | null
          created_at: string
          dispute_id: string
          id: string
          is_internal: boolean | null
          message: string
          sender_id: string | null
          sender_type: string
        }
        Insert: {
          attachments?: Json | null
          created_at?: string
          dispute_id: string
          id?: string
          is_internal?: boolean | null
          message: string
          sender_id?: string | null
          sender_type: string
        }
        Update: {
          attachments?: Json | null
          created_at?: string
          dispute_id?: string
          id?: string
          is_internal?: boolean | null
          message?: string
          sender_id?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_messages_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          admin_notes: string | null
          cj_dispute_id: string | null
          created_at: string
          customer_email: string
          customer_evidence: Json | null
          description: string
          dispute_type: string
          id: string
          last_followup_sent_at: string | null
          order_id: string | null
          resolution_amount: number | null
          resolution_notes: string | null
          resolution_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          cj_dispute_id?: string | null
          created_at?: string
          customer_email: string
          customer_evidence?: Json | null
          description: string
          dispute_type: string
          id?: string
          last_followup_sent_at?: string | null
          order_id?: string | null
          resolution_amount?: number | null
          resolution_notes?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          cj_dispute_id?: string | null
          created_at?: string
          customer_email?: string
          customer_evidence?: Json | null
          description?: string
          dispute_type?: string
          id?: string
          last_followup_sent_at?: string | null
          order_id?: string | null
          resolution_amount?: number | null
          resolution_notes?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaign_events: {
        Row: {
          campaign_id: string
          created_at: string
          email: string
          event_type: string
          id: string
          ip_address: string | null
          link_url: string | null
          user_agent: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          email: string
          event_type: string
          id?: string
          ip_address?: string | null
          link_url?: string | null
          user_agent?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          email?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          link_url?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          ai_content_type: string | null
          ai_prompt: string | null
          click_count: number
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_ai_generated: boolean
          is_recurring: boolean
          last_recurring_sent_at: string | null
          next_recurring_at: string | null
          open_count: number
          recurrence_day: number | null
          recurrence_pattern: string | null
          recurrence_time: string | null
          scheduled_at: string | null
          sent_at: string | null
          sent_count: number
          status: string
          subject: string
          target_preferences: Json
          unique_clicks: number
          unique_opens: number
          updated_at: string
        }
        Insert: {
          ai_content_type?: string | null
          ai_prompt?: string | null
          click_count?: number
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_ai_generated?: boolean
          is_recurring?: boolean
          last_recurring_sent_at?: string | null
          next_recurring_at?: string | null
          open_count?: number
          recurrence_day?: number | null
          recurrence_pattern?: string | null
          recurrence_time?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject: string
          target_preferences?: Json
          unique_clicks?: number
          unique_opens?: number
          updated_at?: string
        }
        Update: {
          ai_content_type?: string | null
          ai_prompt?: string | null
          click_count?: number
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_ai_generated?: boolean
          is_recurring?: boolean
          last_recurring_sent_at?: string | null
          next_recurring_at?: string | null
          open_count?: number
          recurrence_day?: number | null
          recurrence_pattern?: string | null
          recurrence_time?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject?: string
          target_preferences?: Json
          unique_clicks?: number
          unique_opens?: number
          updated_at?: string
        }
        Relationships: []
      }
      frontend_error_logs: {
        Row: {
          component_name: string | null
          created_at: string
          error_message: string
          error_type: string
          id: string
          metadata: Json | null
          page_url: string | null
          session_id: string | null
          stack_trace: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          component_name?: string | null
          created_at?: string
          error_message: string
          error_type: string
          id?: string
          metadata?: Json | null
          page_url?: string | null
          session_id?: string | null
          stack_trace?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          component_name?: string | null
          created_at?: string
          error_message?: string
          error_type?: string
          id?: string
          metadata?: Json | null
          page_url?: string | null
          session_id?: string | null
          stack_trace?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ga4_daily_snapshots: {
        Row: {
          active_users: number | null
          avg_session_duration: number | null
          bounce_rate: number | null
          countries: Json | null
          created_at: string
          devices: Json | null
          id: string
          new_users: number | null
          page_views: number | null
          purchases: number | null
          report_date: string
          revenue: number | null
          sessions: number | null
          synced_at: string | null
          top_pages: Json | null
          traffic_sources: Json | null
        }
        Insert: {
          active_users?: number | null
          avg_session_duration?: number | null
          bounce_rate?: number | null
          countries?: Json | null
          created_at?: string
          devices?: Json | null
          id?: string
          new_users?: number | null
          page_views?: number | null
          purchases?: number | null
          report_date: string
          revenue?: number | null
          sessions?: number | null
          synced_at?: string | null
          top_pages?: Json | null
          traffic_sources?: Json | null
        }
        Update: {
          active_users?: number | null
          avg_session_duration?: number | null
          bounce_rate?: number | null
          countries?: Json | null
          created_at?: string
          devices?: Json | null
          id?: string
          new_users?: number | null
          page_views?: number | null
          purchases?: number | null
          report_date?: string
          revenue?: number | null
          sessions?: number | null
          synced_at?: string | null
          top_pages?: Json | null
          traffic_sources?: Json | null
        }
        Relationships: []
      }
      google_sheets_exports: {
        Row: {
          created_at: string
          id: string
          product_count: number
          spreadsheet_id: string
          spreadsheet_url: string
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_count?: number
          spreadsheet_id: string
          spreadsheet_url: string
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          product_count?: number
          spreadsheet_id?: string
          spreadsheet_url?: string
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      gsc_sync_runs: {
        Row: {
          created_at: string
          days: number | null
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          guide_count: number | null
          id: string
          metadata: Json | null
          pages_with_data: number | null
          reason: string
          rows_upserted: number | null
          started_at: string
          status: string
          total_clicks: number | null
          total_impressions: number | null
          total_raw_rows: number | null
          unmatched_rows: number | null
        }
        Insert: {
          created_at?: string
          days?: number | null
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          guide_count?: number | null
          id?: string
          metadata?: Json | null
          pages_with_data?: number | null
          reason?: string
          rows_upserted?: number | null
          started_at?: string
          status?: string
          total_clicks?: number | null
          total_impressions?: number | null
          total_raw_rows?: number | null
          unmatched_rows?: number | null
        }
        Update: {
          created_at?: string
          days?: number | null
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          guide_count?: number | null
          id?: string
          metadata?: Json | null
          pages_with_data?: number | null
          reason?: string
          rows_upserted?: number | null
          started_at?: string
          status?: string
          total_clicks?: number | null
          total_impressions?: number | null
          total_raw_rows?: number | null
          unmatched_rows?: number | null
        }
        Relationships: []
      }
      gsc_sync_settings: {
        Row: {
          auto_sync_enabled: boolean
          id: string
          sync_hour: number
          sync_minute: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_sync_enabled?: boolean
          id?: string
          sync_hour?: number
          sync_minute?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_sync_enabled?: boolean
          id?: string
          sync_hour?: number
          sync_minute?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      keyword_rankings: {
        Row: {
          clicks: number | null
          country: string | null
          created_at: string
          ctr: number | null
          device: string | null
          id: string
          impressions: number | null
          keyword: string
          last_synced_at: string | null
          position: number | null
          slug: string | null
          tracked_date: string
        }
        Insert: {
          clicks?: number | null
          country?: string | null
          created_at?: string
          ctr?: number | null
          device?: string | null
          id?: string
          impressions?: number | null
          keyword: string
          last_synced_at?: string | null
          position?: number | null
          slug?: string | null
          tracked_date?: string
        }
        Update: {
          clicks?: number | null
          country?: string | null
          created_at?: string
          ctr?: number | null
          device?: string | null
          id?: string
          impressions?: number | null
          keyword?: string
          last_synced_at?: string | null
          position?: number | null
          slug?: string | null
          tracked_date?: string
        }
        Relationships: []
      }
      keyword_watchlist: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          is_active: boolean | null
          keyword: string
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          keyword: string
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          keyword?: string
          updated_at?: string
        }
        Relationships: []
      }
      loss_making_notifications: {
        Row: {
          created_at: string
          id: string
          margin_percentage: number
          notified_at: string
          product_id: string | null
          product_name: string
          total_loss: number
        }
        Insert: {
          created_at?: string
          id?: string
          margin_percentage: number
          notified_at?: string
          product_id?: string | null
          product_name: string
          total_loss: number
        }
        Update: {
          created_at?: string
          id?: string
          margin_percentage?: number
          notified_at?: string
          product_id?: string | null
          product_name?: string
          total_loss?: number
        }
        Relationships: [
          {
            foreignKeyName: "loss_making_notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loss_making_notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_ad_actions: {
        Row: {
          action_type: string
          affected_urls: string[] | null
          campaign_ids: string[] | null
          created_at: string
          executed_at: string | null
          id: string
          is_recommendation: boolean | null
          platform: string
          reverted_at: string | null
          trigger_reason: string
          trigger_status: string
        }
        Insert: {
          action_type: string
          affected_urls?: string[] | null
          campaign_ids?: string[] | null
          created_at?: string
          executed_at?: string | null
          id?: string
          is_recommendation?: boolean | null
          platform: string
          reverted_at?: string | null
          trigger_reason: string
          trigger_status: string
        }
        Update: {
          action_type?: string
          affected_urls?: string[] | null
          campaign_ids?: string[] | null
          created_at?: string
          executed_at?: string | null
          id?: string
          is_recommendation?: boolean | null
          platform?: string
          reverted_at?: string | null
          trigger_reason?: string
          trigger_status?: string
        }
        Relationships: []
      }
      monitoring_ad_landing_pages: {
        Row: {
          alternative_url: string | null
          at_risk: boolean | null
          created_at: string
          cta_visible: boolean | null
          fallback_url: string | null
          funnel_metrics: Json | null
          health_status: string | null
          id: string
          is_active: boolean | null
          last_check_at: string | null
          last_status: string | null
          load_time_ms: number | null
          page_type: string
          product_visible: boolean | null
          risk_reason: string | null
          updated_at: string
          url_path: string
        }
        Insert: {
          alternative_url?: string | null
          at_risk?: boolean | null
          created_at?: string
          cta_visible?: boolean | null
          fallback_url?: string | null
          funnel_metrics?: Json | null
          health_status?: string | null
          id?: string
          is_active?: boolean | null
          last_check_at?: string | null
          last_status?: string | null
          load_time_ms?: number | null
          page_type: string
          product_visible?: boolean | null
          risk_reason?: string | null
          updated_at?: string
          url_path: string
        }
        Update: {
          alternative_url?: string | null
          at_risk?: boolean | null
          created_at?: string
          cta_visible?: boolean | null
          fallback_url?: string | null
          funnel_metrics?: Json | null
          health_status?: string | null
          id?: string
          is_active?: boolean | null
          last_check_at?: string | null
          last_status?: string | null
          load_time_ms?: number | null
          page_type?: string
          product_visible?: boolean | null
          risk_reason?: string | null
          updated_at?: string
          url_path?: string
        }
        Relationships: []
      }
      monitoring_ai_summaries: {
        Row: {
          actions_taken: Json | null
          ai_summary: string
          confidence_level: string | null
          created_at: string
          current_risks: Json | null
          id: string
          incidents: Json | null
          model_used: string | null
          recommendation: string
          score: number | null
          status: string
          status_emoji: string
          summary_date: string
          what_changed: string[] | null
        }
        Insert: {
          actions_taken?: Json | null
          ai_summary: string
          confidence_level?: string | null
          created_at?: string
          current_risks?: Json | null
          id?: string
          incidents?: Json | null
          model_used?: string | null
          recommendation: string
          score?: number | null
          status: string
          status_emoji: string
          summary_date: string
          what_changed?: string[] | null
        }
        Update: {
          actions_taken?: Json | null
          ai_summary?: string
          confidence_level?: string | null
          created_at?: string
          current_risks?: Json | null
          id?: string
          incidents?: Json | null
          model_used?: string | null
          recommendation?: string
          score?: number | null
          status?: string
          status_emoji?: string
          summary_date?: string
          what_changed?: string[] | null
        }
        Relationships: []
      }
      monitoring_alerts: {
        Row: {
          affected_urls: string[] | null
          alert_key: string
          category: string
          created_at: string
          description: string
          first_detected_at: string
          id: string
          is_active: boolean
          last_detected_at: string
          notification_sent: boolean
          resolved_at: string | null
          screenshot_url: string | null
          severity: string
          suggested_fix: string | null
          title: string
          updated_at: string
        }
        Insert: {
          affected_urls?: string[] | null
          alert_key: string
          category: string
          created_at?: string
          description: string
          first_detected_at?: string
          id?: string
          is_active?: boolean
          last_detected_at?: string
          notification_sent?: boolean
          resolved_at?: string | null
          screenshot_url?: string | null
          severity: string
          suggested_fix?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          affected_urls?: string[] | null
          alert_key?: string
          category?: string
          created_at?: string
          description?: string
          first_detected_at?: string
          id?: string
          is_active?: boolean
          last_detected_at?: string
          notification_sent?: boolean
          resolved_at?: string | null
          screenshot_url?: string | null
          severity?: string
          suggested_fix?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      monitoring_audit_logs: {
        Row: {
          action_result: string | null
          action_taken: string
          action_type: string
          affected_components: string[] | null
          affected_urls: string[] | null
          id: string
          is_recommendation: boolean | null
          metadata: Json | null
          related_incident_id: string | null
          related_run_id: string | null
          severity: string
          timestamp: string
          trigger_condition: string
        }
        Insert: {
          action_result?: string | null
          action_taken: string
          action_type: string
          affected_components?: string[] | null
          affected_urls?: string[] | null
          id?: string
          is_recommendation?: boolean | null
          metadata?: Json | null
          related_incident_id?: string | null
          related_run_id?: string | null
          severity: string
          timestamp?: string
          trigger_condition: string
        }
        Update: {
          action_result?: string | null
          action_taken?: string
          action_type?: string
          affected_components?: string[] | null
          affected_urls?: string[] | null
          id?: string
          is_recommendation?: boolean | null
          metadata?: Json | null
          related_incident_id?: string | null
          related_run_id?: string | null
          severity?: string
          timestamp?: string
          trigger_condition?: string
        }
        Relationships: []
      }
      monitoring_auto_actions: {
        Row: {
          action_details: Json
          action_type: string
          created_at: string
          error_message: string | null
          id: string
          incident_id: string | null
          reverted_at: string | null
          target_component: string | null
          was_successful: boolean | null
        }
        Insert: {
          action_details: Json
          action_type: string
          created_at?: string
          error_message?: string | null
          id?: string
          incident_id?: string | null
          reverted_at?: string | null
          target_component?: string | null
          was_successful?: boolean | null
        }
        Update: {
          action_details?: Json
          action_type?: string
          created_at?: string
          error_message?: string | null
          id?: string
          incident_id?: string | null
          reverted_at?: string | null
          target_component?: string | null
          was_successful?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_auto_actions_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "monitoring_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_budget_tapers: {
        Row: {
          affected_urls: string[] | null
          campaign_ids: string[] | null
          created_at: string
          executed_at: string | null
          id: string
          is_recommendation: boolean
          original_budget_percent: number
          platform: string
          revert_reason: string | null
          reverted_at: string | null
          taper_reason: string
          tapered_budget_percent: number
          trigger_id: string | null
          trigger_type: string
        }
        Insert: {
          affected_urls?: string[] | null
          campaign_ids?: string[] | null
          created_at?: string
          executed_at?: string | null
          id?: string
          is_recommendation?: boolean
          original_budget_percent?: number
          platform: string
          revert_reason?: string | null
          reverted_at?: string | null
          taper_reason: string
          tapered_budget_percent: number
          trigger_id?: string | null
          trigger_type: string
        }
        Update: {
          affected_urls?: string[] | null
          campaign_ids?: string[] | null
          created_at?: string
          executed_at?: string | null
          id?: string
          is_recommendation?: boolean
          original_budget_percent?: number
          platform?: string
          revert_reason?: string | null
          reverted_at?: string | null
          taper_reason?: string
          tapered_budget_percent?: number
          trigger_id?: string | null
          trigger_type?: string
        }
        Relationships: []
      }
      monitoring_conversion_baselines: {
        Row: {
          baseline_period_end: string
          baseline_period_start: string
          baseline_value: number
          created_at: string
          current_value: number | null
          id: string
          last_updated_at: string
          metric_name: string
          page_type: string
          sample_size: number
        }
        Insert: {
          baseline_period_end: string
          baseline_period_start: string
          baseline_value: number
          created_at?: string
          current_value?: number | null
          id?: string
          last_updated_at?: string
          metric_name: string
          page_type: string
          sample_size?: number
        }
        Update: {
          baseline_period_end?: string
          baseline_period_start?: string
          baseline_value?: number
          created_at?: string
          current_value?: number | null
          id?: string
          last_updated_at?: string
          metric_name?: string
          page_type?: string
          sample_size?: number
        }
        Relationships: []
      }
      monitoring_founder_snapshots: {
        Row: {
          add_to_cart_rate_7day_avg: number | null
          add_to_cart_rate_today: number | null
          ads_health_status: string
          aov_7day_avg: number | null
          aov_today: number | null
          cart_health: string | null
          checkout_health: string | null
          checkout_start_rate_7day_avg: number | null
          checkout_start_rate_today: number | null
          confidence_score: number | null
          conversion_rate_7day_avg: number | null
          conversion_rate_today: number | null
          created_at: string
          id: string
          pdp_health: string | null
          recent_incidents: Json | null
          revenue_7day_avg: number | null
          revenue_today: number | null
          snapshot_date: string
          status_explanation: string | null
          top_landing_pages: Json | null
        }
        Insert: {
          add_to_cart_rate_7day_avg?: number | null
          add_to_cart_rate_today?: number | null
          ads_health_status: string
          aov_7day_avg?: number | null
          aov_today?: number | null
          cart_health?: string | null
          checkout_health?: string | null
          checkout_start_rate_7day_avg?: number | null
          checkout_start_rate_today?: number | null
          confidence_score?: number | null
          conversion_rate_7day_avg?: number | null
          conversion_rate_today?: number | null
          created_at?: string
          id?: string
          pdp_health?: string | null
          recent_incidents?: Json | null
          revenue_7day_avg?: number | null
          revenue_today?: number | null
          snapshot_date?: string
          status_explanation?: string | null
          top_landing_pages?: Json | null
        }
        Update: {
          add_to_cart_rate_7day_avg?: number | null
          add_to_cart_rate_today?: number | null
          ads_health_status?: string
          aov_7day_avg?: number | null
          aov_today?: number | null
          cart_health?: string | null
          checkout_health?: string | null
          checkout_start_rate_7day_avg?: number | null
          checkout_start_rate_today?: number | null
          confidence_score?: number | null
          conversion_rate_7day_avg?: number | null
          conversion_rate_today?: number | null
          created_at?: string
          id?: string
          pdp_health?: string | null
          recent_incidents?: Json | null
          revenue_7day_avg?: number | null
          revenue_today?: number | null
          snapshot_date?: string
          status_explanation?: string | null
          top_landing_pages?: Json | null
        }
        Relationships: []
      }
      monitoring_incidents: {
        Row: {
          acknowledged_at: string | null
          affected_component: string | null
          affected_files: string[] | null
          alert_id: string | null
          auto_action_details: Json | null
          auto_action_taken: string | null
          created_at: string
          detected_at: string
          dom_snapshot: string | null
          fallback_activated: boolean | null
          id: string
          incident_type: string
          network_logs: Json | null
          recent_changes: Json | null
          resolved_at: string | null
          rollback_applied: boolean | null
          root_cause_summary: string | null
          screenshots: Json | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          affected_component?: string | null
          affected_files?: string[] | null
          alert_id?: string | null
          auto_action_details?: Json | null
          auto_action_taken?: string | null
          created_at?: string
          detected_at?: string
          dom_snapshot?: string | null
          fallback_activated?: boolean | null
          id?: string
          incident_type: string
          network_logs?: Json | null
          recent_changes?: Json | null
          resolved_at?: string | null
          rollback_applied?: boolean | null
          root_cause_summary?: string | null
          screenshots?: Json | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          affected_component?: string | null
          affected_files?: string[] | null
          alert_id?: string | null
          auto_action_details?: Json | null
          auto_action_taken?: string | null
          created_at?: string
          detected_at?: string
          dom_snapshot?: string | null
          fallback_activated?: boolean | null
          id?: string
          incident_type?: string
          network_logs?: Json | null
          recent_changes?: Json | null
          resolved_at?: string | null
          rollback_applied?: boolean | null
          root_cause_summary?: string | null
          screenshots?: Json | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_incidents_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "monitoring_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_landing_page_scores: {
        Row: {
          add_to_cart_stability_score: number | null
          bestseller_health_score: number | null
          campaign_id: string | null
          category_integrity_score: number | null
          checkout_reachability_score: number | null
          conversion_trend_score: number | null
          created_at: string
          health_status: string
          id: string
          last_calculated_at: string
          mobile_performance_score: number | null
          overall_score: number
          page_type: string
          previous_score: number | null
          product_availability_score: number | null
          score_breakdown: Json | null
          score_delta: number | null
          updated_at: string
          url_path: string
        }
        Insert: {
          add_to_cart_stability_score?: number | null
          bestseller_health_score?: number | null
          campaign_id?: string | null
          category_integrity_score?: number | null
          checkout_reachability_score?: number | null
          conversion_trend_score?: number | null
          created_at?: string
          health_status?: string
          id?: string
          last_calculated_at?: string
          mobile_performance_score?: number | null
          overall_score?: number
          page_type: string
          previous_score?: number | null
          product_availability_score?: number | null
          score_breakdown?: Json | null
          score_delta?: number | null
          updated_at?: string
          url_path: string
        }
        Update: {
          add_to_cart_stability_score?: number | null
          bestseller_health_score?: number | null
          campaign_id?: string | null
          category_integrity_score?: number | null
          checkout_reachability_score?: number | null
          conversion_trend_score?: number | null
          created_at?: string
          health_status?: string
          id?: string
          last_calculated_at?: string
          mobile_performance_score?: number | null
          overall_score?: number
          page_type?: string
          previous_score?: number | null
          product_availability_score?: number | null
          score_breakdown?: Json | null
          score_delta?: number | null
          updated_at?: string
          url_path?: string
        }
        Relationships: []
      }
      monitoring_predictive_alerts: {
        Row: {
          affected_components: string[] | null
          affected_urls: string[] | null
          alert_type: string
          created_at: string
          estimated_hours_to_nogo: number | null
          id: string
          indicators: Json
          is_active: boolean
          recommended_actions: string[] | null
          resolution_reason: string | null
          resolved_at: string | null
          risk_level: string
          severity: string
          updated_at: string
        }
        Insert: {
          affected_components?: string[] | null
          affected_urls?: string[] | null
          alert_type: string
          created_at?: string
          estimated_hours_to_nogo?: number | null
          id?: string
          indicators?: Json
          is_active?: boolean
          recommended_actions?: string[] | null
          resolution_reason?: string | null
          resolved_at?: string | null
          risk_level: string
          severity?: string
          updated_at?: string
        }
        Update: {
          affected_components?: string[] | null
          affected_urls?: string[] | null
          alert_type?: string
          created_at?: string
          estimated_hours_to_nogo?: number | null
          id?: string
          indicators?: Json
          is_active?: boolean
          recommended_actions?: string[] | null
          resolution_reason?: string | null
          resolved_at?: string | null
          risk_level?: string
          severity?: string
          updated_at?: string
        }
        Relationships: []
      }
      monitoring_priority_rankings: {
        Row: {
          ad_spend_at_risk: number | null
          affected_urls: string[] | null
          conversion_drop_percent: number | null
          created_at: string
          estimated_impact: string
          fix_complexity: string | null
          id: string
          is_active: boolean | null
          issue_summary: string
          priority_rank: number
          recommended_action: string
          related_incident_id: string | null
          resolved_at: string | null
          revenue_impact_score: number | null
          updated_at: string
          why_it_matters: string
        }
        Insert: {
          ad_spend_at_risk?: number | null
          affected_urls?: string[] | null
          conversion_drop_percent?: number | null
          created_at?: string
          estimated_impact: string
          fix_complexity?: string | null
          id?: string
          is_active?: boolean | null
          issue_summary: string
          priority_rank: number
          recommended_action: string
          related_incident_id?: string | null
          resolved_at?: string | null
          revenue_impact_score?: number | null
          updated_at?: string
          why_it_matters: string
        }
        Update: {
          ad_spend_at_risk?: number | null
          affected_urls?: string[] | null
          conversion_drop_percent?: number | null
          created_at?: string
          estimated_impact?: string
          fix_complexity?: string | null
          id?: string
          is_active?: boolean | null
          issue_summary?: string
          priority_rank?: number
          recommended_action?: string
          related_incident_id?: string | null
          resolved_at?: string | null
          revenue_impact_score?: number | null
          updated_at?: string
          why_it_matters?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_priority_rankings_related_incident_id_fkey"
            columns: ["related_incident_id"]
            isOneToOne: false
            referencedRelation: "monitoring_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_realtime_alerts: {
        Row: {
          affected_campaigns: string[] | null
          affected_urls: string[] | null
          alert_group_key: string | null
          alert_type: string
          created_at: string
          current_score: number | null
          delivered_email: boolean | null
          delivered_lovable: boolean | null
          delivered_slack: boolean | null
          delivered_whatsapp: boolean | null
          expires_at: string | null
          grouped_count: number | null
          id: string
          is_grouped: boolean | null
          is_suppressed: boolean | null
          payload: Json | null
          previous_score: number | null
          recommended_action: string | null
          score_delta: number | null
          screenshot_urls: string[] | null
          severity: string
          summary: string
          suppression_reason: string | null
          title: string
        }
        Insert: {
          affected_campaigns?: string[] | null
          affected_urls?: string[] | null
          alert_group_key?: string | null
          alert_type: string
          created_at?: string
          current_score?: number | null
          delivered_email?: boolean | null
          delivered_lovable?: boolean | null
          delivered_slack?: boolean | null
          delivered_whatsapp?: boolean | null
          expires_at?: string | null
          grouped_count?: number | null
          id?: string
          is_grouped?: boolean | null
          is_suppressed?: boolean | null
          payload?: Json | null
          previous_score?: number | null
          recommended_action?: string | null
          score_delta?: number | null
          screenshot_urls?: string[] | null
          severity?: string
          summary: string
          suppression_reason?: string | null
          title: string
        }
        Update: {
          affected_campaigns?: string[] | null
          affected_urls?: string[] | null
          alert_group_key?: string | null
          alert_type?: string
          created_at?: string
          current_score?: number | null
          delivered_email?: boolean | null
          delivered_lovable?: boolean | null
          delivered_slack?: boolean | null
          delivered_whatsapp?: boolean | null
          expires_at?: string | null
          grouped_count?: number | null
          id?: string
          is_grouped?: boolean | null
          is_suppressed?: boolean | null
          payload?: Json | null
          previous_score?: number | null
          recommended_action?: string | null
          score_delta?: number | null
          screenshot_urls?: string[] | null
          severity?: string
          summary?: string
          suppression_reason?: string | null
          title?: string
        }
        Relationships: []
      }
      monitoring_release_guards: {
        Row: {
          add_to_cart_check_passed: boolean | null
          affected_components: string[] | null
          all_checks_passed: boolean
          bestseller_check_passed: boolean | null
          blocked: boolean
          category_check_passed: boolean | null
          created_at: string
          failure_report: Json | null
          id: string
          mobile_render_check_passed: boolean | null
          override_approved_at: string | null
          override_approved_by: string | null
          revenue_impact_summary: string | null
          run_at: string
          triggered_by: string
        }
        Insert: {
          add_to_cart_check_passed?: boolean | null
          affected_components?: string[] | null
          all_checks_passed?: boolean
          bestseller_check_passed?: boolean | null
          blocked?: boolean
          category_check_passed?: boolean | null
          created_at?: string
          failure_report?: Json | null
          id?: string
          mobile_render_check_passed?: boolean | null
          override_approved_at?: string | null
          override_approved_by?: string | null
          revenue_impact_summary?: string | null
          run_at?: string
          triggered_by?: string
        }
        Update: {
          add_to_cart_check_passed?: boolean | null
          affected_components?: string[] | null
          all_checks_passed?: boolean
          bestseller_check_passed?: boolean | null
          blocked?: boolean
          category_check_passed?: boolean | null
          created_at?: string
          failure_report?: Json | null
          id?: string
          mobile_render_check_passed?: boolean | null
          override_approved_at?: string | null
          override_approved_by?: string | null
          revenue_impact_summary?: string | null
          run_at?: string
          triggered_by?: string
        }
        Relationships: []
      }
      monitoring_runs: {
        Row: {
          checks_failed: number | null
          checks_passed: number | null
          completed_at: string | null
          created_at: string
          details: Json | null
          id: string
          run_type: string
          started_at: string
          success: boolean | null
        }
        Insert: {
          checks_failed?: number | null
          checks_passed?: number | null
          completed_at?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          run_type: string
          started_at?: string
          success?: boolean | null
        }
        Update: {
          checks_failed?: number | null
          checks_passed?: number | null
          completed_at?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          run_type?: string
          started_at?: string
          success?: boolean | null
        }
        Relationships: []
      }
      monitoring_scaling_thresholds: {
        Row: {
          auto_protections: Json | null
          created_at: string
          failure_modes: Json | null
          id: string
          is_active: boolean | null
          metrics_to_watch: Json | null
          pause_conditions: Json | null
          required_checks: Json | null
          scale_conditions: Json | null
          tier_multiplier: number
          traffic_tier: string
          updated_at: string
          warning_signs: Json | null
        }
        Insert: {
          auto_protections?: Json | null
          created_at?: string
          failure_modes?: Json | null
          id?: string
          is_active?: boolean | null
          metrics_to_watch?: Json | null
          pause_conditions?: Json | null
          required_checks?: Json | null
          scale_conditions?: Json | null
          tier_multiplier?: number
          traffic_tier: string
          updated_at?: string
          warning_signs?: Json | null
        }
        Update: {
          auto_protections?: Json | null
          created_at?: string
          failure_modes?: Json | null
          id?: string
          is_active?: boolean | null
          metrics_to_watch?: Json | null
          pause_conditions?: Json | null
          required_checks?: Json | null
          scale_conditions?: Json | null
          tier_multiplier?: number
          traffic_tier?: string
          updated_at?: string
          warning_signs?: Json | null
        }
        Relationships: []
      }
      monitoring_score_history: {
        Row: {
          health_status: string
          id: string
          overall_score: number
          recorded_at: string
          score_breakdown: Json | null
          url_path: string
        }
        Insert: {
          health_status: string
          id?: string
          overall_score: number
          recorded_at?: string
          score_breakdown?: Json | null
          url_path: string
        }
        Update: {
          health_status?: string
          id?: string
          overall_score?: number
          recorded_at?: string
          score_breakdown?: Json | null
          url_path?: string
        }
        Relationships: []
      }
      monitoring_self_healing_logs: {
        Row: {
          action_taken: string
          affected_url: string | null
          component_name: string
          created_at: string
          fallback_state: Json | null
          id: string
          original_state: Json | null
          permanent_fix_suggestion: string | null
          reverted_at: string | null
          trigger_reason: string
        }
        Insert: {
          action_taken: string
          affected_url?: string | null
          component_name: string
          created_at?: string
          fallback_state?: Json | null
          id?: string
          original_state?: Json | null
          permanent_fix_suggestion?: string | null
          reverted_at?: string | null
          trigger_reason: string
        }
        Update: {
          action_taken?: string
          affected_url?: string | null
          component_name?: string
          created_at?: string
          fallback_state?: Json | null
          id?: string
          original_state?: Json | null
          permanent_fix_suggestion?: string | null
          reverted_at?: string | null
          trigger_reason?: string
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          email: string
          id: string
          is_active: boolean
          preference_token: string | null
          preferences: Json
          subscribed_at: string
          unsubscribed_at: string | null
        }
        Insert: {
          email: string
          id?: string
          is_active?: boolean
          preference_token?: string | null
          preferences?: Json
          subscribed_at?: string
          unsubscribed_at?: string | null
        }
        Update: {
          email?: string
          id?: string
          is_active?: boolean
          preference_token?: string | null
          preferences?: Json
          subscribed_at?: string
          unsubscribed_at?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          cj_order_created_at: string | null
          cj_order_id: string | null
          cj_order_status: string | null
          cj_shipping_info: Json | null
          created_at: string
          currency: string
          customer_email: string | null
          id: string
          items: Json
          order_access_token: string | null
          shipping_address: Json | null
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          total_amount: number
          tracking_carrier: string | null
          tracking_number: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cj_order_created_at?: string | null
          cj_order_id?: string | null
          cj_order_status?: string | null
          cj_shipping_info?: Json | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          id?: string
          items: Json
          order_access_token?: string | null
          shipping_address?: Json | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          total_amount: number
          tracking_carrier?: string | null
          tracking_number?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cj_order_created_at?: string | null
          cj_order_id?: string | null
          cj_order_status?: string | null
          cj_shipping_info?: Json | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          id?: string
          items?: Json
          order_access_token?: string | null
          shipping_address?: Json | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          total_amount?: number
          tracking_carrier?: string | null
          tracking_number?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      packaging_inventory: {
        Row: {
          cj_product_id: string | null
          created_at: string
          id: string
          item_name: string
          item_type: string
          last_restocked_at: string | null
          notes: string | null
          quantity: number
          reorder_threshold: number
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          cj_product_id?: string | null
          created_at?: string
          id?: string
          item_name: string
          item_type: string
          last_restocked_at?: string | null
          notes?: string | null
          quantity?: number
          reorder_threshold?: number
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          cj_product_id?: string | null
          created_at?: string
          id?: string
          item_name?: string
          item_type?: string
          last_restocked_at?: string | null
          notes?: string | null
          quantity?: number
          reorder_threshold?: number
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      packaging_inventory_logs: {
        Row: {
          change_amount: number
          change_type: string
          created_at: string
          id: string
          inventory_id: string | null
          item_type: string
          notes: string | null
          order_id: string | null
        }
        Insert: {
          change_amount: number
          change_type: string
          created_at?: string
          id?: string
          inventory_id?: string | null
          item_type: string
          notes?: string | null
          order_id?: string | null
        }
        Update: {
          change_amount?: number
          change_type?: string
          created_at?: string
          id?: string
          inventory_id?: string | null
          item_type?: string
          notes?: string | null
          order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packaging_inventory_logs_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "packaging_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_inventory_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      passkey_credentials: {
        Row: {
          counter: number
          created_at: string
          credential_id: string
          device_name: string | null
          id: string
          last_used_at: string | null
          public_key: string
          user_id: string
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_id: string
          device_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key: string
          user_id: string
        }
        Update: {
          counter?: number
          created_at?: string
          credential_id?: string
          device_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key?: string
          user_id?: string
        }
        Relationships: []
      }
      performance_alerts: {
        Row: {
          created_at: string
          current_value: number
          id: string
          metric_name: string
          notified_at: string
          sample_count: number
          threshold_type: string
          threshold_value: number
        }
        Insert: {
          created_at?: string
          current_value: number
          id?: string
          metric_name: string
          notified_at?: string
          sample_count?: number
          threshold_type: string
          threshold_value: number
        }
        Update: {
          created_at?: string
          current_value?: number
          id?: string
          metric_name?: string
          notified_at?: string
          sample_count?: number
          threshold_type?: string
          threshold_value?: number
        }
        Relationships: []
      }
      performance_metrics: {
        Row: {
          created_at: string
          id: string
          metric_name: string
          metric_value: number
          page_url: string | null
          rating: string
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metric_name: string
          metric_value: number
          page_url?: string | null
          rating: string
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metric_name?: string
          metric_value?: number
          page_url?: string | null
          rating?: string
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      product_bundles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          discount_percentage: number
          id: string
          is_active: boolean
          name: string
          product_ids: string[]
          times_purchased: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_percentage?: number
          id?: string
          is_active?: boolean
          name: string
          product_ids: string[]
          times_purchased?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_percentage?: number
          id?: string
          is_active?: boolean
          name?: string
          product_ids?: string[]
          times_purchased?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          product_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          product_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      product_matches: {
        Row: {
          competitor_product_id: string
          created_at: string
          id: string
          is_verified: boolean
          match_score: number
          match_type: string
          product_id: string
          updated_at: string
        }
        Insert: {
          competitor_product_id: string
          created_at?: string
          id?: string
          is_verified?: boolean
          match_score?: number
          match_type?: string
          product_id: string
          updated_at?: string
        }
        Update: {
          competitor_product_id?: string
          created_at?: string
          id?: string
          is_verified?: boolean
          match_score?: number
          match_type?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_matches_competitor_product_id_fkey"
            columns: ["competitor_product_id"]
            isOneToOne: false
            referencedRelation: "competitor_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_matches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_matches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      product_qa_results: {
        Row: {
          add_to_cart_check: boolean | null
          all_checks_passed: boolean
          block_reason: string | null
          blocked_from_ads: boolean | null
          blocked_from_bestsellers: boolean | null
          created_at: string
          failed_checks: Json | null
          failure_screenshots: Json | null
          id: string
          image_gallery_check: boolean | null
          override_approved_at: string | null
          override_approved_by: string | null
          override_reason: string | null
          page_loads_check: boolean | null
          price_check: boolean | null
          product_id: string
          product_name: string
          product_slug: string
          qa_status: string
          schema_check: boolean | null
          shipping_copy_check: boolean | null
          stock_status_check: boolean | null
          trigger_type: string
          updated_at: string
          url_check: boolean | null
        }
        Insert: {
          add_to_cart_check?: boolean | null
          all_checks_passed?: boolean
          block_reason?: string | null
          blocked_from_ads?: boolean | null
          blocked_from_bestsellers?: boolean | null
          created_at?: string
          failed_checks?: Json | null
          failure_screenshots?: Json | null
          id?: string
          image_gallery_check?: boolean | null
          override_approved_at?: string | null
          override_approved_by?: string | null
          override_reason?: string | null
          page_loads_check?: boolean | null
          price_check?: boolean | null
          product_id: string
          product_name: string
          product_slug: string
          qa_status?: string
          schema_check?: boolean | null
          shipping_copy_check?: boolean | null
          stock_status_check?: boolean | null
          trigger_type: string
          updated_at?: string
          url_check?: boolean | null
        }
        Update: {
          add_to_cart_check?: boolean | null
          all_checks_passed?: boolean
          block_reason?: string | null
          blocked_from_ads?: boolean | null
          blocked_from_bestsellers?: boolean | null
          created_at?: string
          failed_checks?: Json | null
          failure_screenshots?: Json | null
          id?: string
          image_gallery_check?: boolean | null
          override_approved_at?: string | null
          override_approved_by?: string | null
          override_reason?: string | null
          page_loads_check?: boolean | null
          price_check?: boolean | null
          product_id?: string
          product_name?: string
          product_slug?: string
          qa_status?: string
          schema_check?: boolean | null
          shipping_copy_check?: boolean | null
          stock_status_check?: boolean | null
          trigger_type?: string
          updated_at?: string
          url_check?: boolean | null
        }
        Relationships: []
      }
      product_reviews: {
        Row: {
          content: string | null
          created_at: string
          helpful_count: number
          id: string
          is_approved: boolean
          is_verified_buyer: boolean
          product_id: string
          rating: number
          reviewer_name: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          helpful_count?: number
          id?: string
          is_approved?: boolean
          is_verified_buyer?: boolean
          product_id: string
          rating: number
          reviewer_name?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          helpful_count?: number
          id?: string
          is_approved?: boolean
          is_verified_buyer?: boolean
          product_id?: string
          rating?: number
          reviewer_name?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      product_supplier_mappings: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          match_score: number | null
          notes: string | null
          product_id: string
          supplier_product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          match_score?: number | null
          notes?: string | null
          product_id: string
          supplier_product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          match_score?: number | null
          notes?: string | null
          product_id?: string
          supplier_product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_supplier_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_supplier_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_supplier_mappings_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          canonical_product_id: string | null
          category: string | null
          cj_product_id: string | null
          compare_at_price: number | null
          cost_price: number | null
          created_at: string
          dedupe_key: string | null
          description: string | null
          id: string
          image_url: string | null
          images: string[] | null
          is_active: boolean | null
          is_duplicate: boolean
          last_stock_sync_at: string | null
          name: string
          price: number
          shipping_time: string | null
          sku: string | null
          slug: string | null
          stock: number | null
          stock_source: string | null
          stock_sync_error: string | null
          stock_sync_status: string | null
          supplier_name: string | null
          supplier_warehouse: string | null
          updated_at: string
          variants: Json | null
          weight: number | null
        }
        Insert: {
          canonical_product_id?: string | null
          category?: string | null
          cj_product_id?: string | null
          compare_at_price?: number | null
          cost_price?: number | null
          created_at?: string
          dedupe_key?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          is_active?: boolean | null
          is_duplicate?: boolean
          last_stock_sync_at?: string | null
          name: string
          price: number
          shipping_time?: string | null
          sku?: string | null
          slug?: string | null
          stock?: number | null
          stock_source?: string | null
          stock_sync_error?: string | null
          stock_sync_status?: string | null
          supplier_name?: string | null
          supplier_warehouse?: string | null
          updated_at?: string
          variants?: Json | null
          weight?: number | null
        }
        Update: {
          canonical_product_id?: string | null
          category?: string | null
          cj_product_id?: string | null
          compare_at_price?: number | null
          cost_price?: number | null
          created_at?: string
          dedupe_key?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          is_active?: boolean | null
          is_duplicate?: boolean
          last_stock_sync_at?: string | null
          name?: string
          price?: number
          shipping_time?: string | null
          sku?: string | null
          slug?: string | null
          stock?: number | null
          stock_source?: string | null
          stock_sync_error?: string | null
          stock_sync_status?: string | null
          supplier_name?: string | null
          supplier_warehouse?: string | null
          updated_at?: string
          variants?: Json | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_canonical_product_id_fkey"
            columns: ["canonical_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_canonical_product_id_fkey"
            columns: ["canonical_product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          created_at: string
          function_name: string
          id: string
          request_count: number
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          created_at?: string
          function_name: string
          id?: string
          request_count?: number
          updated_at?: string
          user_id: string
          window_start?: string
        }
        Update: {
          created_at?: string
          function_name?: string
          id?: string
          request_count?: number
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      remarketing_emails: {
        Row: {
          clicked_at: string | null
          converted_at: string | null
          created_at: string
          customer_email: string
          email_type: string
          id: string
          opened_at: string | null
          order_id: string
          product_upsold: string
          sent_at: string
        }
        Insert: {
          clicked_at?: string | null
          converted_at?: string | null
          created_at?: string
          customer_email: string
          email_type: string
          id?: string
          opened_at?: string | null
          order_id: string
          product_upsold: string
          sent_at?: string
        }
        Update: {
          clicked_at?: string | null
          converted_at?: string | null
          created_at?: string
          customer_email?: string
          email_type?: string
          id?: string
          opened_at?: string | null
          order_id?: string
          product_upsold?: string
          sent_at?: string
        }
        Relationships: []
      }
      saved_google_ads: {
        Row: {
          created_at: string
          descriptions: string[]
          display_paths: string[]
          headlines: string[]
          id: string
          keywords: string[]
          language: string
          product_id: string | null
          product_name: string
          target_audience: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          descriptions: string[]
          display_paths: string[]
          headlines: string[]
          id?: string
          keywords: string[]
          language?: string
          product_id?: string | null
          product_name: string
          target_audience?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          descriptions?: string[]
          display_paths?: string[]
          headlines?: string[]
          id?: string
          keywords?: string[]
          language?: string
          product_id?: string | null
          product_name?: string
          target_audience?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_google_ads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_google_ads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      scraped_content: {
        Row: {
          content_html: string | null
          content_markdown: string | null
          created_at: string
          id: string
          metadata: Json | null
          notes: string | null
          scraped_by: string | null
          tags: string[] | null
          title: string | null
          updated_at: string
          url: string
        }
        Insert: {
          content_html?: string | null
          content_markdown?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          scraped_by?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          content_html?: string | null
          content_markdown?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          scraped_by?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      seo_collections: {
        Row: {
          created_at: string
          display_order: number | null
          faq: Json | null
          id: string
          is_active: boolean | null
          meta_description: string | null
          meta_title: string | null
          name: string
          primary_keyword: string
          product_category_filter: string | null
          product_keyword_filter: string | null
          related_blog_slug: string | null
          related_collection_slugs: string[] | null
          secondary_keywords: string[] | null
          seo_intro: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          faq?: Json | null
          id?: string
          is_active?: boolean | null
          meta_description?: string | null
          meta_title?: string | null
          name: string
          primary_keyword: string
          product_category_filter?: string | null
          product_keyword_filter?: string | null
          related_blog_slug?: string | null
          related_collection_slugs?: string[] | null
          secondary_keywords?: string[] | null
          seo_intro: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          faq?: Json | null
          id?: string
          is_active?: boolean | null
          meta_description?: string | null
          meta_title?: string | null
          name?: string
          primary_keyword?: string
          product_category_filter?: string | null
          product_keyword_filter?: string | null
          related_blog_slug?: string | null
          related_collection_slugs?: string[] | null
          secondary_keywords?: string[] | null
          seo_intro?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      seo_nurture_queue: {
        Row: {
          conversion_sent: boolean
          conversion_sent_at: string | null
          created_at: string
          education_sent: boolean
          education_sent_at: string | null
          email: string
          id: string
          signup_source: string | null
          subscribed_at: string
          updated_at: string
          welcome_sent: boolean
          welcome_sent_at: string | null
        }
        Insert: {
          conversion_sent?: boolean
          conversion_sent_at?: string | null
          created_at?: string
          education_sent?: boolean
          education_sent_at?: string | null
          email: string
          id?: string
          signup_source?: string | null
          subscribed_at?: string
          updated_at?: string
          welcome_sent?: boolean
          welcome_sent_at?: string | null
        }
        Update: {
          conversion_sent?: boolean
          conversion_sent_at?: string | null
          created_at?: string
          education_sent?: boolean
          education_sent_at?: string | null
          email?: string
          id?: string
          signup_source?: string | null
          subscribed_at?: string
          updated_at?: string
          welcome_sent?: boolean
          welcome_sent_at?: string | null
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      sourcing_opportunities: {
        Row: {
          cj_product_id: string | null
          competitor: string
          competitor_product_id: string | null
          created_at: string
          current_rank: number
          first_seen_at: string
          id: string
          last_seen_at: string
          notes: string | null
          price: number | null
          product_name: string
          status: string
          updated_at: string
        }
        Insert: {
          cj_product_id?: string | null
          competitor: string
          competitor_product_id?: string | null
          created_at?: string
          current_rank: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          notes?: string | null
          price?: number | null
          product_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          cj_product_id?: string | null
          competitor?: string
          competitor_product_id?: string | null
          created_at?: string
          current_rank?: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          notes?: string | null
          price?: number | null
          product_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sourcing_opportunities_competitor_product_id_fkey"
            columns: ["competitor_product_id"]
            isOneToOne: true
            referencedRelation: "competitor_products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_notifications: {
        Row: {
          created_at: string
          email: string
          id: string
          notified_at: string | null
          product_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          notified_at?: string | null
          product_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          notified_at?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_sync_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_count: number
          id: string
          ok_count: number
          positive_stock_count: number
          run_at: string
          sample_errors: Json | null
          total_checked: number
          triggered_by: string | null
          zero_stock_count: number
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_count?: number
          id?: string
          ok_count?: number
          positive_stock_count?: number
          run_at?: string
          sample_errors?: Json | null
          total_checked?: number
          triggered_by?: string | null
          zero_stock_count?: number
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_count?: number
          id?: string
          ok_count?: number
          positive_stock_count?: number
          run_at?: string
          sample_errors?: Json | null
          total_checked?: number
          triggered_by?: string | null
          zero_stock_count?: number
        }
        Relationships: []
      }
      supplier_import_logs: {
        Row: {
          completed_at: string | null
          errors: Json | null
          failed_count: number | null
          filename: string | null
          id: string
          imported_by: string | null
          imported_count: number | null
          skipped_count: number | null
          started_at: string
          status: string | null
          supplier: string
          total_rows: number | null
        }
        Insert: {
          completed_at?: string | null
          errors?: Json | null
          failed_count?: number | null
          filename?: string | null
          id?: string
          imported_by?: string | null
          imported_count?: number | null
          skipped_count?: number | null
          started_at?: string
          status?: string | null
          supplier: string
          total_rows?: number | null
        }
        Update: {
          completed_at?: string | null
          errors?: Json | null
          failed_count?: number | null
          filename?: string | null
          id?: string
          imported_by?: string | null
          imported_count?: number | null
          skipped_count?: number | null
          started_at?: string
          status?: string | null
          supplier?: string
          total_rows?: number | null
        }
        Relationships: []
      }
      supplier_products: {
        Row: {
          brand: string | null
          category: string | null
          cost_price: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          images: string[] | null
          is_discontinued: boolean | null
          msrp: number | null
          product_name: string
          raw_data: Json | null
          shipping_time: string | null
          sku: string | null
          stock_status: string | null
          supplier: string
          supplier_product_id: string
          updated_at: string
          weight: number | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          cost_price: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          is_discontinued?: boolean | null
          msrp?: number | null
          product_name: string
          raw_data?: Json | null
          shipping_time?: string | null
          sku?: string | null
          stock_status?: string | null
          supplier: string
          supplier_product_id: string
          updated_at?: string
          weight?: number | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          is_discontinued?: boolean | null
          msrp?: number | null
          product_name?: string
          raw_data?: Json | null
          shipping_time?: string | null
          sku?: string | null
          stock_status?: string | null
          supplier?: string
          supplier_product_id?: string
          updated_at?: string
          weight?: number | null
        }
        Relationships: []
      }
      sync_progress: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_count: number | null
          error_messages: string[] | null
          id: string
          last_offset: number | null
          last_sync_at: string | null
          started_at: string | null
          status: string | null
          synced_count: number | null
          total_products: number | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_count?: number | null
          error_messages?: string[] | null
          id?: string
          last_offset?: number | null
          last_sync_at?: string | null
          started_at?: string | null
          status?: string | null
          synced_count?: number | null
          total_products?: number | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_count?: number | null
          error_messages?: string[] | null
          id?: string
          last_offset?: number | null
          last_sync_at?: string | null
          started_at?: string | null
          status?: string | null
          synced_count?: number | null
          total_products?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      variant_fix_logs: {
        Row: {
          created_at: string
          error_message: string | null
          fixed_products: Json | null
          id: string
          products_fixed: number
          success: boolean
          total_variants_fixed: number
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          fixed_products?: Json | null
          id?: string
          products_fixed?: number
          success?: boolean
          total_variants_fixed?: number
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          fixed_products?: Json | null
          id?: string
          products_fixed?: number
          success?: boolean
          total_variants_fixed?: number
          triggered_by?: string | null
        }
        Relationships: []
      }
      visitor_activity: {
        Row: {
          activity_type: string
          browser: string | null
          city: string | null
          country: string | null
          created_at: string
          device_type: string | null
          id: string
          is_internal: boolean | null
          last_seen_at: string | null
          latitude: number | null
          longitude: number | null
          order_id: string | null
          order_value: number | null
          page_path: string | null
          product_id: string | null
          product_name: string | null
          product_price: number | null
          product_quantity: number | null
          referrer: string | null
          referrer_category: string | null
          screen_height: number | null
          screen_width: number | null
          session_id: string
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          activity_type: string
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          is_internal?: boolean | null
          last_seen_at?: string | null
          latitude?: number | null
          longitude?: number | null
          order_id?: string | null
          order_value?: number | null
          page_path?: string | null
          product_id?: string | null
          product_name?: string | null
          product_price?: number | null
          product_quantity?: number | null
          referrer?: string | null
          referrer_category?: string | null
          screen_height?: number | null
          screen_width?: number | null
          session_id: string
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          activity_type?: string
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          is_internal?: boolean | null
          last_seen_at?: string | null
          latitude?: number | null
          longitude?: number | null
          order_id?: string | null
          order_value?: number | null
          page_path?: string | null
          product_id?: string | null
          product_name?: string | null
          product_price?: number | null
          product_quantity?: number | null
          referrer?: string | null
          referrer_category?: string | null
          screen_height?: number | null
          screen_width?: number | null
          session_id?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitor_activity_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitor_activity_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      products_public: {
        Row: {
          canonical_product_id: string | null
          category: string | null
          cj_product_id: string | null
          compare_at_price: number | null
          created_at: string | null
          dedupe_key: string | null
          description: string | null
          id: string | null
          image_url: string | null
          images: string[] | null
          is_active: boolean | null
          is_duplicate: boolean | null
          last_stock_sync_at: string | null
          name: string | null
          price: number | null
          shipping_time: string | null
          sku: string | null
          slug: string | null
          stock: number | null
          stock_source: string | null
          stock_sync_status: string | null
          supplier_name: string | null
          supplier_warehouse: string | null
          updated_at: string | null
          variants: Json | null
          weight: number | null
        }
        Insert: {
          canonical_product_id?: string | null
          category?: string | null
          cj_product_id?: string | null
          compare_at_price?: number | null
          created_at?: string | null
          dedupe_key?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          images?: string[] | null
          is_active?: boolean | null
          is_duplicate?: boolean | null
          last_stock_sync_at?: string | null
          name?: string | null
          price?: number | null
          shipping_time?: string | null
          sku?: string | null
          slug?: string | null
          stock?: number | null
          stock_source?: string | null
          stock_sync_status?: string | null
          supplier_name?: string | null
          supplier_warehouse?: string | null
          updated_at?: string | null
          variants?: Json | null
          weight?: number | null
        }
        Update: {
          canonical_product_id?: string | null
          category?: string | null
          cj_product_id?: string | null
          compare_at_price?: number | null
          created_at?: string | null
          dedupe_key?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          images?: string[] | null
          is_active?: boolean | null
          is_duplicate?: boolean | null
          last_stock_sync_at?: string | null
          name?: string | null
          price?: number | null
          shipping_time?: string | null
          sku?: string | null
          slug?: string | null
          stock?: number | null
          stock_source?: string | null
          stock_sync_status?: string | null
          supplier_name?: string | null
          supplier_warehouse?: string | null
          updated_at?: string | null
          variants?: Json | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_canonical_product_id_fkey"
            columns: ["canonical_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_canonical_product_id_fkey"
            columns: ["canonical_product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_rate_limit: {
        Args: {
          p_function_name: string
          p_max_requests?: number
          p_user_id: string
          p_window_minutes?: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          reset_at: string
        }[]
      }
      cleanup_old_visitor_activity: { Args: never; Returns: undefined }
      cleanup_preview_visitor_activity: { Args: never; Returns: number }
      generate_product_slug: { Args: { product_name: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      update_session_heartbeat: {
        Args: { p_session_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "customer"
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
      app_role: ["admin", "customer"],
    },
  },
} as const
