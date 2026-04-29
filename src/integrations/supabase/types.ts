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
      admin_resources: {
        Row: {
          created_at: string
          file_path: string
          file_size: number | null
          file_url: string
          id: string
          title: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_path: string
          file_size?: number | null
          file_url: string
          id?: string
          title: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_path?: string
          file_size?: number | null
          file_url?: string
          id?: string
          title?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      agm_actions: {
        Row: {
          action_type: string
          batch_id: string | null
          brand_guard_pass: boolean | null
          created_at: string
          diff_snapshot: Json | null
          executed_at: string | null
          executed_by: string | null
          execution_mode: string
          expected_uplift: Json | null
          hypothesis: string | null
          id: string
          measurement_window_days: number | null
          priority: number | null
          risk_score: number | null
          rollback_at: string | null
          rollback_plan: string | null
          run_id: string | null
          status: string
          target_ref: string
          target_type: string | null
          updated_at: string
        }
        Insert: {
          action_type: string
          batch_id?: string | null
          brand_guard_pass?: boolean | null
          created_at?: string
          diff_snapshot?: Json | null
          executed_at?: string | null
          executed_by?: string | null
          execution_mode?: string
          expected_uplift?: Json | null
          hypothesis?: string | null
          id?: string
          measurement_window_days?: number | null
          priority?: number | null
          risk_score?: number | null
          rollback_at?: string | null
          rollback_plan?: string | null
          run_id?: string | null
          status?: string
          target_ref: string
          target_type?: string | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          batch_id?: string | null
          brand_guard_pass?: boolean | null
          created_at?: string
          diff_snapshot?: Json | null
          executed_at?: string | null
          executed_by?: string | null
          execution_mode?: string
          expected_uplift?: Json | null
          hypothesis?: string | null
          id?: string
          measurement_window_days?: number | null
          priority?: number | null
          risk_score?: number | null
          rollback_at?: string | null
          rollback_plan?: string | null
          run_id?: string | null
          status?: string
          target_ref?: string
          target_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agm_actions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agm_config: {
        Row: {
          auto_rollback_threshold_pct: number | null
          brand_guard_enabled: boolean | null
          daily_action_budget: number | null
          daily_indexing_budget: number | null
          execution_mode: string
          id: string
          max_critical_changes_per_day: number | null
          min_collection_products: number | null
          playbook_weights: Json | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_rollback_threshold_pct?: number | null
          brand_guard_enabled?: boolean | null
          daily_action_budget?: number | null
          daily_indexing_budget?: number | null
          execution_mode?: string
          id?: string
          max_critical_changes_per_day?: number | null
          min_collection_products?: number | null
          playbook_weights?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_rollback_threshold_pct?: number | null
          brand_guard_enabled?: boolean | null
          daily_action_budget?: number | null
          daily_indexing_budget?: number | null
          execution_mode?: string
          id?: string
          max_critical_changes_per_day?: number | null
          min_collection_products?: number | null
          playbook_weights?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      agm_experiments: {
        Row: {
          baseline_metrics: Json | null
          confidence: number | null
          created_at: string
          ended_at: string | null
          experiment_type: string
          id: string
          is_holdout: boolean | null
          result_metrics: Json | null
          started_at: string | null
          status: string
          target_ref: string
          updated_at: string
          variant_a: Json
          variant_b: Json
          winner: string | null
        }
        Insert: {
          baseline_metrics?: Json | null
          confidence?: number | null
          created_at?: string
          ended_at?: string | null
          experiment_type: string
          id?: string
          is_holdout?: boolean | null
          result_metrics?: Json | null
          started_at?: string | null
          status?: string
          target_ref: string
          updated_at?: string
          variant_a?: Json
          variant_b?: Json
          winner?: string | null
        }
        Update: {
          baseline_metrics?: Json | null
          confidence?: number | null
          created_at?: string
          ended_at?: string | null
          experiment_type?: string
          id?: string
          is_holdout?: boolean | null
          result_metrics?: Json | null
          started_at?: string | null
          status?: string
          target_ref?: string
          updated_at?: string
          variant_a?: Json
          variant_b?: Json
          winner?: string | null
        }
        Relationships: []
      }
      agm_impact_tracking: {
        Row: {
          action_id: string
          anomaly_detected: boolean | null
          attribution_confidence: number | null
          auto_rolled_back: boolean | null
          baseline_clicks: number | null
          baseline_ctr: number | null
          baseline_impressions: number | null
          baseline_position: number | null
          created_at: string
          day14_clicks: number | null
          day14_ctr: number | null
          day14_impressions: number | null
          day14_position: number | null
          day28_clicks: number | null
          day28_ctr: number | null
          day28_impressions: number | null
          day28_position: number | null
          day7_clicks: number | null
          day7_ctr: number | null
          day7_impressions: number | null
          day7_position: number | null
          id: string
          target_ref: string
          updated_at: string
        }
        Insert: {
          action_id: string
          anomaly_detected?: boolean | null
          attribution_confidence?: number | null
          auto_rolled_back?: boolean | null
          baseline_clicks?: number | null
          baseline_ctr?: number | null
          baseline_impressions?: number | null
          baseline_position?: number | null
          created_at?: string
          day14_clicks?: number | null
          day14_ctr?: number | null
          day14_impressions?: number | null
          day14_position?: number | null
          day28_clicks?: number | null
          day28_ctr?: number | null
          day28_impressions?: number | null
          day28_position?: number | null
          day7_clicks?: number | null
          day7_ctr?: number | null
          day7_impressions?: number | null
          day7_position?: number | null
          id?: string
          target_ref: string
          updated_at?: string
        }
        Update: {
          action_id?: string
          anomaly_detected?: boolean | null
          attribution_confidence?: number | null
          auto_rolled_back?: boolean | null
          baseline_clicks?: number | null
          baseline_ctr?: number | null
          baseline_impressions?: number | null
          baseline_position?: number | null
          created_at?: string
          day14_clicks?: number | null
          day14_ctr?: number | null
          day14_impressions?: number | null
          day14_position?: number | null
          day28_clicks?: number | null
          day28_ctr?: number | null
          day28_impressions?: number | null
          day28_position?: number | null
          day7_clicks?: number | null
          day7_ctr?: number | null
          day7_impressions?: number | null
          day7_position?: number | null
          id?: string
          target_ref?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agm_impact_tracking_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "agm_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      agm_opportunity_edges: {
        Row: {
          created_at: string
          edge_type: string
          id: string
          metadata: Json | null
          source_node_id: string
          target_node_id: string
          weight: number | null
        }
        Insert: {
          created_at?: string
          edge_type: string
          id?: string
          metadata?: Json | null
          source_node_id: string
          target_node_id: string
          weight?: number | null
        }
        Update: {
          created_at?: string
          edge_type?: string
          id?: string
          metadata?: Json | null
          source_node_id?: string
          target_node_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agm_opportunity_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "agm_opportunity_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agm_opportunity_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "agm_opportunity_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      agm_opportunity_nodes: {
        Row: {
          created_at: string
          id: string
          node_ref: string
          node_type: string
          opportunity_score: number | null
          signals: Json
          title: string | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          node_ref: string
          node_type: string
          opportunity_score?: number | null
          signals?: Json
          title?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          node_ref?: string
          node_type?: string
          opportunity_score?: number | null
          signals?: Json
          title?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      agm_playbook_history: {
        Row: {
          action_type: string
          avg_uplift_clicks: number | null
          avg_uplift_impressions: number | null
          created_at: string
          id: string
          page_type: string | null
          sample_count: number | null
          success_rate: number | null
          weight: number | null
        }
        Insert: {
          action_type: string
          avg_uplift_clicks?: number | null
          avg_uplift_impressions?: number | null
          created_at?: string
          id?: string
          page_type?: string | null
          sample_count?: number | null
          success_rate?: number | null
          weight?: number | null
        }
        Update: {
          action_type?: string
          avg_uplift_clicks?: number | null
          avg_uplift_impressions?: number | null
          created_at?: string
          id?: string
          page_type?: string | null
          sample_count?: number | null
          success_rate?: number | null
          weight?: number | null
        }
        Relationships: []
      }
      authority_clusters: {
        Row: {
          config: Json | null
          cornerstone_slug: string
          cornerstone_title: string | null
          created_at: string
          created_by: string | null
          id: string
          niche: string
          status: string
          topical_map: Json | null
          updated_at: string
        }
        Insert: {
          config?: Json | null
          cornerstone_slug: string
          cornerstone_title?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          niche: string
          status?: string
          topical_map?: Json | null
          updated_at?: string
        }
        Update: {
          config?: Json | null
          cornerstone_slug?: string
          cornerstone_title?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          niche?: string
          status?: string
          topical_map?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      backlink_outreach_scores: {
        Row: {
          authority_score: number | null
          created_at: string
          id: string
          outreach_priority_score: number | null
          recommended_anchor_type: string | null
          relevance_score: number | null
          run_id: string | null
          spam_risk: number | null
          suggested_pitch_topic: string | null
          target_domain: string
          tier: string
        }
        Insert: {
          authority_score?: number | null
          created_at?: string
          id?: string
          outreach_priority_score?: number | null
          recommended_anchor_type?: string | null
          relevance_score?: number | null
          run_id?: string | null
          spam_risk?: number | null
          suggested_pitch_topic?: string | null
          target_domain: string
          tier?: string
        }
        Update: {
          authority_score?: number | null
          created_at?: string
          id?: string
          outreach_priority_score?: number | null
          recommended_anchor_type?: string | null
          relevance_score?: number | null
          run_id?: string | null
          spam_risk?: number | null
          suggested_pitch_topic?: string | null
          target_domain?: string
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "backlink_outreach_scores_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
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
          cluster_primary: string | null
          cluster_secondary: string | null
          content: string
          created_at: string
          excerpt: string
          featured_image: string | null
          id: string
          is_noindexed: boolean | null
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
          cluster_primary?: string | null
          cluster_secondary?: string | null
          content: string
          created_at?: string
          excerpt: string
          featured_image?: string | null
          id?: string
          is_noindexed?: boolean | null
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
          cluster_primary?: string | null
          cluster_secondary?: string | null
          content?: string
          created_at?: string
          excerpt?: string
          featured_image?: string | null
          id?: string
          is_noindexed?: boolean | null
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
      cj_us_winners: {
        Row: {
          auto_imported: boolean | null
          category: string | null
          cj_product_id: string
          created_at: string
          id: string
          image_ok: boolean | null
          image_url: string | null
          imported_product_id: string | null
          name: string
          price: number
          score: number
          shipping_time: number | null
          stock: number | null
          updated_at: string
          warehouse: string
          weight: number | null
        }
        Insert: {
          auto_imported?: boolean | null
          category?: string | null
          cj_product_id: string
          created_at?: string
          id?: string
          image_ok?: boolean | null
          image_url?: string | null
          imported_product_id?: string | null
          name: string
          price?: number
          score?: number
          shipping_time?: number | null
          stock?: number | null
          updated_at?: string
          warehouse?: string
          weight?: number | null
        }
        Update: {
          auto_imported?: boolean | null
          category?: string | null
          cj_product_id?: string
          created_at?: string
          id?: string
          image_ok?: boolean | null
          image_url?: string | null
          imported_product_id?: string | null
          name?: string
          price?: number
          score?: number
          shipping_time?: number | null
          stock?: number | null
          updated_at?: string
          warehouse?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cj_us_winners_imported_product_id_fkey"
            columns: ["imported_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cj_us_winners_imported_product_id_fkey"
            columns: ["imported_product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
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
      cluster_articles: {
        Row: {
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
          article_role: string | null
          canonical_url: string | null
          cluster_id: string
          content: string | null
          created_at: string
          faq: Json | null
          id: string
          internal_links: Json | null
          key_takeaways: string[] | null
          meta_description: string | null
          outline: Json | null
          primary_keyword: string | null
          publish_date: string | null
          search_intent: string | null
          secondary_keywords: string[] | null
          seo_title: string | null
          slug: string
          status: string
          title: string | null
          updated_at: string
          word_count: number | null
        }
        Insert: {
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          article_role?: string | null
          canonical_url?: string | null
          cluster_id: string
          content?: string | null
          created_at?: string
          faq?: Json | null
          id?: string
          internal_links?: Json | null
          key_takeaways?: string[] | null
          meta_description?: string | null
          outline?: Json | null
          primary_keyword?: string | null
          publish_date?: string | null
          search_intent?: string | null
          secondary_keywords?: string[] | null
          seo_title?: string | null
          slug: string
          status?: string
          title?: string | null
          updated_at?: string
          word_count?: number | null
        }
        Update: {
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          article_role?: string | null
          canonical_url?: string | null
          cluster_id?: string
          content?: string | null
          created_at?: string
          faq?: Json | null
          id?: string
          internal_links?: Json | null
          key_takeaways?: string[] | null
          meta_description?: string | null
          outline?: Json | null
          primary_keyword?: string | null
          publish_date?: string | null
          search_intent?: string | null
          secondary_keywords?: string[] | null
          seo_title?: string | null
          slug?: string
          status?: string
          title?: string | null
          updated_at?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cluster_articles_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "authority_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      cluster_publish_queue: {
        Row: {
          article_id: string
          created_at: string
          id: string
          published: boolean | null
          published_at: string | null
          scheduled_date: string
        }
        Insert: {
          article_id: string
          created_at?: string
          id?: string
          published?: boolean | null
          published_at?: string | null
          scheduled_date: string
        }
        Update: {
          article_id?: string
          created_at?: string
          id?: string
          published?: boolean | null
          published_at?: string | null
          scheduled_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "cluster_publish_queue_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "cluster_articles"
            referencedColumns: ["id"]
          },
        ]
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
      competitor_content_intelligence: {
        Row: {
          actionable_improvements: Json | null
          competitor_url: string | null
          content_depth_delta: number | null
          created_at: string
          id: string
          keyword: string
          run_id: string | null
          schema_gap: Json | null
          semantic_gap_score: number | null
          snippet_format_presence: boolean | null
          structural_advantage_score: number | null
        }
        Insert: {
          actionable_improvements?: Json | null
          competitor_url?: string | null
          content_depth_delta?: number | null
          created_at?: string
          id?: string
          keyword: string
          run_id?: string | null
          schema_gap?: Json | null
          semantic_gap_score?: number | null
          snippet_format_presence?: boolean | null
          structural_advantage_score?: number | null
        }
        Update: {
          actionable_improvements?: Json | null
          competitor_url?: string | null
          content_depth_delta?: number | null
          created_at?: string
          id?: string
          keyword?: string
          run_id?: string | null
          schema_gap?: Json | null
          semantic_gap_score?: number | null
          snippet_format_presence?: boolean | null
          structural_advantage_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_content_intelligence_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_gaps: {
        Row: {
          authority_gap: number | null
          competitor_position: number | null
          competitor_url: string | null
          content_gap_score: number | null
          created_at: string
          estimated_gain_if_matched: number | null
          id: string
          keyword: string
          our_position: number | null
          run_id: string | null
          schema_gap: Json | null
        }
        Insert: {
          authority_gap?: number | null
          competitor_position?: number | null
          competitor_url?: string | null
          content_gap_score?: number | null
          created_at?: string
          estimated_gain_if_matched?: number | null
          id?: string
          keyword: string
          our_position?: number | null
          run_id?: string | null
          schema_gap?: Json | null
        }
        Update: {
          authority_gap?: number | null
          competitor_position?: number | null
          competitor_url?: string | null
          content_gap_score?: number | null
          created_at?: string
          estimated_gain_if_matched?: number | null
          id?: string
          keyword?: string
          our_position?: number | null
          run_id?: string | null
          schema_gap?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_gaps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
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
      crawler_sampling_decisions: {
        Row: {
          always_log: boolean
          bot_type: string | null
          created_at: string
          id: string
          ip_address: string | null
          is_appeal_page: boolean
          looks_like_render_trace: boolean
          outcome: string
          page_url: string
          reason: string
          render_trace_state: string | null
          sample_rate: number | null
          sample_roll: number | null
          spoofed_googlebot: boolean
          ua_claims_googlebot: boolean
          user_agent: string
          verified_googlebot: boolean
        }
        Insert: {
          always_log?: boolean
          bot_type?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          is_appeal_page?: boolean
          looks_like_render_trace?: boolean
          outcome: string
          page_url: string
          reason: string
          render_trace_state?: string | null
          sample_rate?: number | null
          sample_roll?: number | null
          spoofed_googlebot?: boolean
          ua_claims_googlebot?: boolean
          user_agent: string
          verified_googlebot?: boolean
        }
        Update: {
          always_log?: boolean
          bot_type?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          is_appeal_page?: boolean
          looks_like_render_trace?: boolean
          outcome?: string
          page_url?: string
          reason?: string
          render_trace_state?: string | null
          sample_rate?: number | null
          sample_roll?: number | null
          spoofed_googlebot?: boolean
          ua_claims_googlebot?: boolean
          user_agent?: string
          verified_googlebot?: boolean
        }
        Relationships: []
      }
      crawler_visits: {
        Row: {
          bot_type: string | null
          created_at: string
          id: string
          idempotency_key: string | null
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
          idempotency_key?: string | null
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
          idempotency_key?: string | null
          ip_address?: string | null
          is_googlebot?: boolean
          page_url?: string
          referrer?: string | null
          user_agent?: string
        }
        Relationships: []
      }
      credential_health_checks: {
        Row: {
          check_type: string
          created_at: string
          details: Json | null
          error_message: string | null
          id: string
          response_time_ms: number | null
          service_account_key_id: string | null
          status: string
        }
        Insert: {
          check_type: string
          created_at?: string
          details?: Json | null
          error_message?: string | null
          id?: string
          response_time_ms?: number | null
          service_account_key_id?: string | null
          status: string
        }
        Update: {
          check_type?: string
          created_at?: string
          details?: Json | null
          error_message?: string | null
          id?: string
          response_time_ms?: number | null
          service_account_key_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_health_checks_service_account_key_id_fkey"
            columns: ["service_account_key_id"]
            isOneToOne: false
            referencedRelation: "service_account_keys"
            referencedColumns: ["id"]
          },
        ]
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
      ctr_model_data: {
        Row: {
          created_at: string
          device: string
          expected_ctr: number
          id: string
          position: number
          query_type: string
          sample_size: number
          stddev_ctr: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          device?: string
          expected_ctr?: number
          id?: string
          position: number
          query_type?: string
          sample_size?: number
          stddev_ctr?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          device?: string
          expected_ctr?: number
          id?: string
          position?: number
          query_type?: string
          sample_size?: number
          stddev_ctr?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      cwv_validation_events: {
        Row: {
          created_by: string | null
          event_type: string
          id: string
          metadata: Json | null
          notes: string | null
          ts: string
        }
        Insert: {
          created_by?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          ts?: string
        }
        Update: {
          created_by?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          ts?: string
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
      governor_decision_logs: {
        Row: {
          created_at: string
          decision: string
          force_override: boolean
          id: string
          next_safe_run_seconds: number | null
          reason: string
          run_type_executed: string | null
          run_type_requested: string
          signals: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          decision: string
          force_override?: boolean
          id?: string
          next_safe_run_seconds?: number | null
          reason: string
          run_type_executed?: string | null
          run_type_requested: string
          signals?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          decision?: string
          force_override?: boolean
          id?: string
          next_safe_run_seconds?: number | null
          reason?: string
          run_type_executed?: string | null
          run_type_requested?: string
          signals?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      gsc_keywords: {
        Row: {
          clicks: number
          created_at: string
          ctr: number
          id: string
          impressions: number
          page: string
          position: number
          query: string
          sync_date: string
          updated_at: string
        }
        Insert: {
          clicks?: number
          created_at?: string
          ctr?: number
          id?: string
          impressions?: number
          page: string
          position?: number
          query: string
          sync_date: string
          updated_at?: string
        }
        Update: {
          clicks?: number
          created_at?: string
          ctr?: number
          id?: string
          impressions?: number
          page?: string
          position?: number
          query?: string
          sync_date?: string
          updated_at?: string
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
      guide_generation_log: {
        Row: {
          duration_ms: number | null
          errors: Json | null
          guides_failed: number | null
          guides_generated: number | null
          id: string
          keywords_processed: string[] | null
          run_at: string
          triggered_by: string | null
        }
        Insert: {
          duration_ms?: number | null
          errors?: Json | null
          guides_failed?: number | null
          guides_generated?: number | null
          id?: string
          keywords_processed?: string[] | null
          run_at?: string
          triggered_by?: string | null
        }
        Update: {
          duration_ms?: number | null
          errors?: Json | null
          guides_failed?: number | null
          guides_generated?: number | null
          id?: string
          keywords_processed?: string[] | null
          run_at?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      indexing_submissions: {
        Row: {
          created_at: string
          id: string
          response_json: Json | null
          run_id: string | null
          status: string
          submitted_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          response_json?: Json | null
          run_id?: string | null
          status?: string
          submitted_at?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          response_json?: Json | null
          run_id?: string | null
          status?: string
          submitted_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "indexing_submissions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_link_injections: {
        Row: {
          anchor_text: string
          anchor_type: string
          approved_at: string | null
          approved_by: string | null
          cluster: string | null
          created_at: string
          id: string
          injected_at: string | null
          injection_type: string
          reverted_at: string | null
          source_slug: string
          status: string
          target_slug: string
          updated_at: string
        }
        Insert: {
          anchor_text: string
          anchor_type: string
          approved_at?: string | null
          approved_by?: string | null
          cluster?: string | null
          created_at?: string
          id?: string
          injected_at?: string | null
          injection_type: string
          reverted_at?: string | null
          source_slug: string
          status?: string
          target_slug: string
          updated_at?: string
        }
        Update: {
          anchor_text?: string
          anchor_type?: string
          approved_at?: string | null
          approved_by?: string | null
          cluster?: string | null
          created_at?: string
          id?: string
          injected_at?: string | null
          injection_type?: string
          reverted_at?: string | null
          source_slug?: string
          status?: string
          target_slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_retry_policies: {
        Row: {
          backoff_minutes: number[] | null
          created_at: string
          enabled: boolean
          id: string
          job_type: string | null
          max_attempts: number | null
          notes: string | null
          provider: string | null
          updated_at: string
        }
        Insert: {
          backoff_minutes?: number[] | null
          created_at?: string
          enabled?: boolean
          id?: string
          job_type?: string | null
          max_attempts?: number | null
          notes?: string | null
          provider?: string | null
          updated_at?: string
        }
        Update: {
          backoff_minutes?: number[] | null
          created_at?: string
          enabled?: boolean
          id?: string
          job_type?: string | null
          max_attempts?: number | null
          notes?: string | null
          provider?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      job_run_logs: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          level: string
          message: string
          run_id: string
          step_key: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          level?: string
          message: string
          run_id: string
          step_key?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          level?: string
          message?: string
          run_id?: string
          step_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_run_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_run_steps: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          result: Json | null
          run_id: string
          started_at: string | null
          status: string
          step_key: string
          step_label: string
          step_order: number
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          result?: Json | null
          run_id: string
          started_at?: string | null
          status?: string
          step_key: string
          step_label: string
          step_order: number
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          result?: Json | null
          run_id?: string
          started_at?: string | null
          status?: string
          step_key?: string
          step_label?: string
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          cancel_reason: string | null
          cancel_requested: boolean
          created_at: string
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          report: Json | null
          source: string
          started_at: string | null
          status: string
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          cancel_requested?: boolean
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          report?: Json | null
          source?: string
          started_at?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          cancel_requested?: boolean
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          report?: Json | null
          source?: string
          started_at?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      key_rotation_logs: {
        Row: {
          account_name: string
          action: string
          created_at: string
          details: Json | null
          id: string
          new_key_id: string | null
          old_key_id: string | null
          performed_by: string | null
          service_account_key_id: string | null
        }
        Insert: {
          account_name: string
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          new_key_id?: string | null
          old_key_id?: string | null
          performed_by?: string | null
          service_account_key_id?: string | null
        }
        Update: {
          account_name?: string
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          new_key_id?: string | null
          old_key_id?: string | null
          performed_by?: string | null
          service_account_key_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "key_rotation_logs_service_account_key_id_fkey"
            columns: ["service_account_key_id"]
            isOneToOne: false
            referencedRelation: "service_account_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      keyword_clusters: {
        Row: {
          avg_position: number | null
          cluster_label: string
          created_at: string
          id: string
          intent_type: string | null
          keyword_count: number
          keywords: Json
          orphan_candidates: Json | null
          primary_keyword: string
          run_id: string | null
          suggested_new_article: boolean | null
          target_url: string | null
          total_clicks: number
          total_impressions: number
          updated_at: string
        }
        Insert: {
          avg_position?: number | null
          cluster_label: string
          created_at?: string
          id?: string
          intent_type?: string | null
          keyword_count?: number
          keywords?: Json
          orphan_candidates?: Json | null
          primary_keyword: string
          run_id?: string | null
          suggested_new_article?: boolean | null
          target_url?: string | null
          total_clicks?: number
          total_impressions?: number
          updated_at?: string
        }
        Update: {
          avg_position?: number | null
          cluster_label?: string
          created_at?: string
          id?: string
          intent_type?: string | null
          keyword_count?: number
          keywords?: Json
          orphan_candidates?: Json | null
          primary_keyword?: string
          run_id?: string | null
          suggested_new_article?: boolean | null
          target_url?: string | null
          total_clicks?: number
          total_impressions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "keyword_clusters_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
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
      market_share_simulations: {
        Row: {
          cluster_expansion_growth: number | null
          competitive_pressure: number | null
          confidence_score: number | null
          created_at: string
          id: string
          projected_market_share_gain: number | null
          projected_revenue_90d: number | null
          projected_traffic_90d: number | null
          run_id: string | null
          scenario: string
          serp_capture_growth: number | null
          top10_share_pct: number | null
          top3_share_pct: number | null
        }
        Insert: {
          cluster_expansion_growth?: number | null
          competitive_pressure?: number | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          projected_market_share_gain?: number | null
          projected_revenue_90d?: number | null
          projected_traffic_90d?: number | null
          run_id?: string | null
          scenario: string
          serp_capture_growth?: number | null
          top10_share_pct?: number | null
          top3_share_pct?: number | null
        }
        Update: {
          cluster_expansion_growth?: number | null
          competitive_pressure?: number | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          projected_market_share_gain?: number | null
          projected_revenue_90d?: number | null
          projected_traffic_90d?: number | null
          run_id?: string | null
          scenario?: string
          serp_capture_growth?: number | null
          top10_share_pct?: number | null
          top3_share_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_share_simulations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_events: {
        Row: {
          context: Json | null
          created_at: string
          event_type: string
          id: string
          message: string
          provider: string
          severity: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          event_type: string
          id?: string
          message: string
          provider: string
          severity?: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          event_type?: string
          id?: string
          message?: string
          provider?: string
          severity?: string
        }
        Relationships: []
      }
      marketing_jobs: {
        Row: {
          attempts: number
          created_at: string
          id: string
          job_type: string
          last_error: string | null
          next_run_at: string
          payload: Json | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          job_type: string
          last_error?: string | null
          next_run_at?: string
          payload?: Json | null
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          job_type?: string
          last_error?: string | null
          next_run_at?: string
          payload?: Json | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      merchant_oauth_state: {
        Row: {
          code_verifier: string
          created_at: string
          expires_at: string
          id: string
          state: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          expires_at?: string
          id?: string
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          expires_at?: string
          id?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      merchant_oauth_tokens: {
        Row: {
          access_token_expires_at: string | null
          created_at: string
          encrypted_refresh_token: string
          id: string
          is_connected: boolean
          last_error: string | null
          last_error_at: string | null
          merchant_center_id: string | null
          scopes: string[] | null
          token_created_at: string
          token_refreshed_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_expires_at?: string | null
          created_at?: string
          encrypted_refresh_token: string
          id?: string
          is_connected?: boolean
          last_error?: string | null
          last_error_at?: string | null
          merchant_center_id?: string | null
          scopes?: string[] | null
          token_created_at?: string
          token_refreshed_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_expires_at?: string | null
          created_at?: string
          encrypted_refresh_token?: string
          id?: string
          is_connected?: boolean
          last_error?: string | null
          last_error_at?: string | null
          merchant_center_id?: string | null
          scopes?: string[] | null
          token_created_at?: string
          token_refreshed_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      merchant_sync_logs: {
        Row: {
          account_info: Json | null
          active_count: number | null
          completed_at: string | null
          created_at: string
          debug_report: Json | null
          eligible_count: number | null
          env_status: Json | null
          error_message: string | null
          errors: Json | null
          first10_payload_preview: Json | null
          id: string
          issues_summary: Json | null
          mode: string | null
          notes: string | null
          payload_built_count: number | null
          priced_count: number | null
          products_with_issues: number | null
          raw_count: number | null
          run_id: string | null
          sample_failures: Json | null
          sent_count: number | null
          started_at: string
          status: string
          sync_type: string
          top_failure_reasons: Json | null
          total_products: number | null
          triggered_by: string | null
        }
        Insert: {
          account_info?: Json | null
          active_count?: number | null
          completed_at?: string | null
          created_at?: string
          debug_report?: Json | null
          eligible_count?: number | null
          env_status?: Json | null
          error_message?: string | null
          errors?: Json | null
          first10_payload_preview?: Json | null
          id?: string
          issues_summary?: Json | null
          mode?: string | null
          notes?: string | null
          payload_built_count?: number | null
          priced_count?: number | null
          products_with_issues?: number | null
          raw_count?: number | null
          run_id?: string | null
          sample_failures?: Json | null
          sent_count?: number | null
          started_at?: string
          status?: string
          sync_type?: string
          top_failure_reasons?: Json | null
          total_products?: number | null
          triggered_by?: string | null
        }
        Update: {
          account_info?: Json | null
          active_count?: number | null
          completed_at?: string | null
          created_at?: string
          debug_report?: Json | null
          eligible_count?: number | null
          env_status?: Json | null
          error_message?: string | null
          errors?: Json | null
          first10_payload_preview?: Json | null
          id?: string
          issues_summary?: Json | null
          mode?: string | null
          notes?: string | null
          payload_built_count?: number | null
          priced_count?: number | null
          products_with_issues?: number | null
          raw_count?: number | null
          run_id?: string | null
          sample_failures?: Json | null
          sent_count?: number | null
          started_at?: string
          status?: string
          sync_type?: string
          top_failure_reasons?: Json | null
          total_products?: number | null
          triggered_by?: string | null
        }
        Relationships: []
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
      optimizer_run_items: {
        Row: {
          after_snapshot: Json | null
          before_snapshot: Json | null
          created_at: string | null
          error_message: string | null
          id: string
          product_id: string
          run_id: string
          scores: Json | null
          status: string | null
          used_ai: boolean | null
          used_fallback: boolean | null
        }
        Insert: {
          after_snapshot?: Json | null
          before_snapshot?: Json | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          product_id: string
          run_id: string
          scores?: Json | null
          status?: string | null
          used_ai?: boolean | null
          used_fallback?: boolean | null
        }
        Update: {
          after_snapshot?: Json | null
          before_snapshot?: Json | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          product_id?: string
          run_id?: string
          scores?: Json | null
          status?: string | null
          used_ai?: boolean | null
          used_fallback?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "optimizer_run_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "optimizer_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      optimizer_runs: {
        Row: {
          completed_at: string | null
          config: Json | null
          created_at: string | null
          error_count: number | null
          fallback_count: number | null
          id: string
          initiated_by: string | null
          mode: string
          notes: string | null
          started_at: string | null
          success_count: number | null
          total_products: number | null
          trigger_source: string | null
          version: string | null
        }
        Insert: {
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          error_count?: number | null
          fallback_count?: number | null
          id?: string
          initiated_by?: string | null
          mode?: string
          notes?: string | null
          started_at?: string | null
          success_count?: number | null
          total_products?: number | null
          trigger_source?: string | null
          version?: string | null
        }
        Update: {
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          error_count?: number | null
          fallback_count?: number | null
          id?: string
          initiated_by?: string | null
          mode?: string
          notes?: string | null
          started_at?: string | null
          success_count?: number | null
          total_products?: number | null
          trigger_source?: string | null
          version?: string | null
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
      page_changelog_entries: {
        Row: {
          build_tag: string
          changes: string[]
          commit_ref: string
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          is_published: boolean
          page_key: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          build_tag: string
          changes?: string[]
          commit_ref: string
          created_at?: string
          created_by?: string | null
          entry_date: string
          id?: string
          is_published?: boolean
          page_key: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          build_tag?: string
          changes?: string[]
          commit_ref?: string
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          is_published?: boolean
          page_key?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
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
      pinterest_board_mappings: {
        Row: {
          board_names: string[]
          category_key: string
          created_at: string
          id: string
          priority: number
          updated_at: string
        }
        Insert: {
          board_names?: string[]
          category_key: string
          created_at?: string
          id?: string
          priority?: number
          updated_at?: string
        }
        Update: {
          board_names?: string[]
          category_key?: string
          created_at?: string
          id?: string
          priority?: number
          updated_at?: string
        }
        Relationships: []
      }
      pinterest_connection: {
        Row: {
          access_token: string | null
          account_id: string | null
          account_name: string | null
          created_at: string
          id: string
          last_error: string | null
          last_publish_at: string | null
          refresh_token: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_publish_at?: string | null
          refresh_token?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_publish_at?: string | null
          refresh_token?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pinterest_keyword_performance: {
        Row: {
          avg_ctr: number | null
          created_at: string | null
          id: string
          keyword: string
          long_tail_variants: Json | null
          pin_count: number | null
          total_clicks: number | null
          total_impressions: number | null
          total_saves: number | null
          updated_at: string | null
        }
        Insert: {
          avg_ctr?: number | null
          created_at?: string | null
          id?: string
          keyword: string
          long_tail_variants?: Json | null
          pin_count?: number | null
          total_clicks?: number | null
          total_impressions?: number | null
          total_saves?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_ctr?: number | null
          created_at?: string | null
          id?: string
          keyword?: string
          long_tail_variants?: Json | null
          pin_count?: number | null
          total_clicks?: number | null
          total_impressions?: number | null
          total_saves?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      pinterest_oauth_states: {
        Row: {
          created_at: string | null
          state: string
        }
        Insert: {
          created_at?: string | null
          state: string
        }
        Update: {
          created_at?: string | null
          state?: string
        }
        Relationships: []
      }
      pinterest_pin_performance: {
        Row: {
          clicks: number | null
          created_at: string | null
          ctr: number | null
          generation_batch: string | null
          hook_angle: string | null
          id: string
          impressions: number | null
          keywords: string[] | null
          parent_pin_id: string | null
          performance_score: number | null
          pin_description: string | null
          pin_id: string
          pin_title: string | null
          product_id: string
          product_url: string | null
          saves: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          clicks?: number | null
          created_at?: string | null
          ctr?: number | null
          generation_batch?: string | null
          hook_angle?: string | null
          id?: string
          impressions?: number | null
          keywords?: string[] | null
          parent_pin_id?: string | null
          performance_score?: number | null
          pin_description?: string | null
          pin_id: string
          pin_title?: string | null
          product_id: string
          product_url?: string | null
          saves?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          clicks?: number | null
          created_at?: string | null
          ctr?: number | null
          generation_batch?: string | null
          hook_angle?: string | null
          id?: string
          impressions?: number | null
          keywords?: string[] | null
          parent_pin_id?: string | null
          performance_score?: number | null
          pin_description?: string | null
          pin_id?: string
          pin_title?: string | null
          product_id?: string
          product_url?: string | null
          saves?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      pinterest_pin_queue: {
        Row: {
          board_name: string
          category_key: string | null
          created_at: string
          destination_link: string
          error_message: string | null
          hashtags: string[] | null
          hook_group: string | null
          id: string
          overlay_text: string | null
          pin_description: string
          pin_external_id: string | null
          pin_image_url: string | null
          pin_title: string
          pin_variant: string
          posted_at: string | null
          priority: string
          product_id: string
          product_name: string
          product_slug: string
          retries: number
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          board_name?: string
          category_key?: string | null
          created_at?: string
          destination_link: string
          error_message?: string | null
          hashtags?: string[] | null
          hook_group?: string | null
          id?: string
          overlay_text?: string | null
          pin_description: string
          pin_external_id?: string | null
          pin_image_url?: string | null
          pin_title: string
          pin_variant: string
          posted_at?: string | null
          priority?: string
          product_id: string
          product_name: string
          product_slug: string
          retries?: number
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          board_name?: string
          category_key?: string | null
          created_at?: string
          destination_link?: string
          error_message?: string | null
          hashtags?: string[] | null
          hook_group?: string | null
          id?: string
          overlay_text?: string | null
          pin_description?: string
          pin_external_id?: string | null
          pin_image_url?: string | null
          pin_title?: string
          pin_variant?: string
          posted_at?: string | null
          priority?: string
          product_id?: string
          product_name?: string
          product_slug?: string
          retries?: number
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pinterest_pins: {
        Row: {
          created_at: string
          generated_at: string
          id: string
          pin_data: Json
          product_id: string
          product_name: string
          product_slug: string
          product_url: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          generated_at?: string
          id?: string
          pin_data?: Json
          product_id: string
          product_name: string
          product_slug: string
          product_url: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          generated_at?: string
          id?: string
          pin_data?: Json
          product_id?: string
          product_name?: string
          product_slug?: string
          product_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_pins_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinterest_pins_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      pinterest_post_logs: {
        Row: {
          action: string
          created_at: string
          error_message: string | null
          id: string
          pin_queue_id: string | null
          response_data: Json | null
          status: string
        }
        Insert: {
          action: string
          created_at?: string
          error_message?: string | null
          id?: string
          pin_queue_id?: string | null
          response_data?: Json | null
          status: string
        }
        Update: {
          action?: string
          created_at?: string
          error_message?: string | null
          id?: string
          pin_queue_id?: string | null
          response_data?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_post_logs_pin_queue_id_fkey"
            columns: ["pin_queue_id"]
            isOneToOne: false
            referencedRelation: "pinterest_pin_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      pinterest_publish_queue: {
        Row: {
          created_at: string | null
          hashtags: string | null
          hook_angle: string | null
          id: string
          image_prompt: string | null
          overlay_text: string | null
          pin_description: string
          pin_id_external: string | null
          pin_title: string
          posting_slot: string | null
          product_id: string
          product_url: string
          published_at: string | null
          scheduled_for: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          hashtags?: string | null
          hook_angle?: string | null
          id?: string
          image_prompt?: string | null
          overlay_text?: string | null
          pin_description: string
          pin_id_external?: string | null
          pin_title: string
          posting_slot?: string | null
          product_id: string
          product_url: string
          published_at?: string | null
          scheduled_for?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          hashtags?: string | null
          hook_angle?: string | null
          id?: string
          image_prompt?: string | null
          overlay_text?: string | null
          pin_description?: string
          pin_id_external?: string | null
          pin_title?: string
          posting_slot?: string | null
          product_id?: string
          product_url?: string
          published_at?: string | null
          scheduled_for?: string | null
          status?: string | null
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
      product_image_compliance: {
        Row: {
          created_at: string
          id: string
          image_position: number
          image_url: string
          is_compliant: boolean | null
          product_id: string
          quality_score: string
          scan_model: string | null
          scan_result: Json | null
          scanned_at: string | null
          updated_at: string
          violations: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_position?: number
          image_url: string
          is_compliant?: boolean | null
          product_id: string
          quality_score?: string
          scan_model?: string | null
          scan_result?: Json | null
          scanned_at?: string | null
          updated_at?: string
          violations?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          image_position?: number
          image_url?: string
          is_compliant?: boolean | null
          product_id?: string
          quality_score?: string
          scan_model?: string | null
          scan_result?: Json | null
          scanned_at?: string | null
          updated_at?: string
          violations?: Json | null
        }
        Relationships: []
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
          ai_last_optimized_at: string | null
          ai_last_preview_at: string | null
          ai_locked: boolean | null
          ai_manual_override: boolean | null
          ai_optimizer_error: string | null
          ai_optimizer_status: string | null
          ai_optimizer_version: string | null
          animal_type: string | null
          benefit_angle: string | null
          brand: string | null
          canonical_product_id: string | null
          category: string | null
          cj_product_id: string | null
          cluster_primary: string | null
          cluster_secondary: string | null
          compare_at_price: number | null
          content_readiness_score: number | null
          conversion_angle: string | null
          cost_price: number | null
          created_at: string
          custom_label_0: string | null
          custom_label_1: string | null
          custom_label_2: string | null
          custom_label_3: string | null
          custom_label_4: string | null
          custom_label_5: string | null
          custom_label_6: string | null
          custom_label_7: string | null
          dedupe_key: string | null
          description: string | null
          description_bullets: string[] | null
          description_optimized_at: string | null
          feed_readiness_score: number | null
          google_product_category: string | null
          id: string
          image_alt_text: string | null
          image_url: string | null
          images: string[] | null
          is_active: boolean | null
          is_duplicate: boolean
          key_feature: string | null
          keyword_cluster: string | null
          last_stock_sync_at: string | null
          meta_description: string | null
          meta_title: string | null
          metadata_optimized_at: string | null
          name: string
          optimized_description: string | null
          optimized_title: string | null
          original_name: string | null
          pinterest_board_override: string | null
          pinterest_category: string | null
          pinterest_disabled: boolean
          pinterest_error: string | null
          pinterest_last_generated_at: string | null
          pinterest_last_posted_at: string | null
          pinterest_priority: string
          pinterest_ready: boolean
          pinterest_status: string | null
          price: number
          primary_intent: string | null
          primary_keyword: string | null
          primary_species: string | null
          product_type: string | null
          quality_flags: string[] | null
          quality_score: number | null
          seo_keywords: string[] | null
          seo_meta_description: string | null
          seo_tier: string
          seo_title: string | null
          shipping_time: string | null
          shopping_priority_score: number | null
          shopping_title: string | null
          short_title: string | null
          sku: string | null
          slug: string | null
          slug_suggestion: string | null
          stock: number | null
          stock_source: string | null
          stock_sync_error: string | null
          stock_sync_status: string | null
          supplier_name: string | null
          supplier_warehouse: string | null
          title_optimized_at: string | null
          updated_at: string
          variants: Json | null
          weight: number | null
        }
        Insert: {
          ai_last_optimized_at?: string | null
          ai_last_preview_at?: string | null
          ai_locked?: boolean | null
          ai_manual_override?: boolean | null
          ai_optimizer_error?: string | null
          ai_optimizer_status?: string | null
          ai_optimizer_version?: string | null
          animal_type?: string | null
          benefit_angle?: string | null
          brand?: string | null
          canonical_product_id?: string | null
          category?: string | null
          cj_product_id?: string | null
          cluster_primary?: string | null
          cluster_secondary?: string | null
          compare_at_price?: number | null
          content_readiness_score?: number | null
          conversion_angle?: string | null
          cost_price?: number | null
          created_at?: string
          custom_label_0?: string | null
          custom_label_1?: string | null
          custom_label_2?: string | null
          custom_label_3?: string | null
          custom_label_4?: string | null
          custom_label_5?: string | null
          custom_label_6?: string | null
          custom_label_7?: string | null
          dedupe_key?: string | null
          description?: string | null
          description_bullets?: string[] | null
          description_optimized_at?: string | null
          feed_readiness_score?: number | null
          google_product_category?: string | null
          id?: string
          image_alt_text?: string | null
          image_url?: string | null
          images?: string[] | null
          is_active?: boolean | null
          is_duplicate?: boolean
          key_feature?: string | null
          keyword_cluster?: string | null
          last_stock_sync_at?: string | null
          meta_description?: string | null
          meta_title?: string | null
          metadata_optimized_at?: string | null
          name: string
          optimized_description?: string | null
          optimized_title?: string | null
          original_name?: string | null
          pinterest_board_override?: string | null
          pinterest_category?: string | null
          pinterest_disabled?: boolean
          pinterest_error?: string | null
          pinterest_last_generated_at?: string | null
          pinterest_last_posted_at?: string | null
          pinterest_priority?: string
          pinterest_ready?: boolean
          pinterest_status?: string | null
          price: number
          primary_intent?: string | null
          primary_keyword?: string | null
          primary_species?: string | null
          product_type?: string | null
          quality_flags?: string[] | null
          quality_score?: number | null
          seo_keywords?: string[] | null
          seo_meta_description?: string | null
          seo_tier?: string
          seo_title?: string | null
          shipping_time?: string | null
          shopping_priority_score?: number | null
          shopping_title?: string | null
          short_title?: string | null
          sku?: string | null
          slug?: string | null
          slug_suggestion?: string | null
          stock?: number | null
          stock_source?: string | null
          stock_sync_error?: string | null
          stock_sync_status?: string | null
          supplier_name?: string | null
          supplier_warehouse?: string | null
          title_optimized_at?: string | null
          updated_at?: string
          variants?: Json | null
          weight?: number | null
        }
        Update: {
          ai_last_optimized_at?: string | null
          ai_last_preview_at?: string | null
          ai_locked?: boolean | null
          ai_manual_override?: boolean | null
          ai_optimizer_error?: string | null
          ai_optimizer_status?: string | null
          ai_optimizer_version?: string | null
          animal_type?: string | null
          benefit_angle?: string | null
          brand?: string | null
          canonical_product_id?: string | null
          category?: string | null
          cj_product_id?: string | null
          cluster_primary?: string | null
          cluster_secondary?: string | null
          compare_at_price?: number | null
          content_readiness_score?: number | null
          conversion_angle?: string | null
          cost_price?: number | null
          created_at?: string
          custom_label_0?: string | null
          custom_label_1?: string | null
          custom_label_2?: string | null
          custom_label_3?: string | null
          custom_label_4?: string | null
          custom_label_5?: string | null
          custom_label_6?: string | null
          custom_label_7?: string | null
          dedupe_key?: string | null
          description?: string | null
          description_bullets?: string[] | null
          description_optimized_at?: string | null
          feed_readiness_score?: number | null
          google_product_category?: string | null
          id?: string
          image_alt_text?: string | null
          image_url?: string | null
          images?: string[] | null
          is_active?: boolean | null
          is_duplicate?: boolean
          key_feature?: string | null
          keyword_cluster?: string | null
          last_stock_sync_at?: string | null
          meta_description?: string | null
          meta_title?: string | null
          metadata_optimized_at?: string | null
          name?: string
          optimized_description?: string | null
          optimized_title?: string | null
          original_name?: string | null
          pinterest_board_override?: string | null
          pinterest_category?: string | null
          pinterest_disabled?: boolean
          pinterest_error?: string | null
          pinterest_last_generated_at?: string | null
          pinterest_last_posted_at?: string | null
          pinterest_priority?: string
          pinterest_ready?: boolean
          pinterest_status?: string | null
          price?: number
          primary_intent?: string | null
          primary_keyword?: string | null
          primary_species?: string | null
          product_type?: string | null
          quality_flags?: string[] | null
          quality_score?: number | null
          seo_keywords?: string[] | null
          seo_meta_description?: string | null
          seo_tier?: string
          seo_title?: string | null
          shipping_time?: string | null
          shopping_priority_score?: number | null
          shopping_title?: string | null
          short_title?: string | null
          sku?: string | null
          slug?: string | null
          slug_suggestion?: string | null
          stock?: number | null
          stock_source?: string | null
          stock_sync_error?: string | null
          stock_sync_status?: string | null
          supplier_name?: string | null
          supplier_warehouse?: string | null
          title_optimized_at?: string | null
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
      published_guides: {
        Row: {
          category: string
          cluster: string
          created_at: string
          excerpt: string
          featured_image: string | null
          generation_source: string | null
          guide_data: Json
          id: string
          indexed_at: string | null
          internal_links_count: number | null
          is_indexed: boolean
          is_published: boolean
          keywords: string[] | null
          products_linked: number | null
          published_at: string
          reading_time: number | null
          related_categories: string[] | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          cluster?: string
          created_at?: string
          excerpt?: string
          featured_image?: string | null
          generation_source?: string | null
          guide_data?: Json
          id?: string
          indexed_at?: string | null
          internal_links_count?: number | null
          is_indexed?: boolean
          is_published?: boolean
          keywords?: string[] | null
          products_linked?: number | null
          published_at?: string
          reading_time?: number | null
          related_categories?: string[] | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          cluster?: string
          created_at?: string
          excerpt?: string
          featured_image?: string | null
          generation_source?: string | null
          guide_data?: Json
          id?: string
          indexed_at?: string | null
          internal_links_count?: number | null
          is_indexed?: boolean
          is_published?: boolean
          keywords?: string[] | null
          products_linked?: number | null
          published_at?: string
          reading_time?: number | null
          related_categories?: string[] | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ranking_defense: {
        Row: {
          auto_response_taken: string | null
          created_at: string
          defense_status: string
          id: string
          keyword: string
          last_ctr: number | null
          last_position_drop: number | null
          locked_at: string | null
          page_url: string
          position: number
          updated_at: string | null
        }
        Insert: {
          auto_response_taken?: string | null
          created_at?: string
          defense_status?: string
          id?: string
          keyword: string
          last_ctr?: number | null
          last_position_drop?: number | null
          locked_at?: string | null
          page_url: string
          position: number
          updated_at?: string | null
        }
        Update: {
          auto_response_taken?: string | null
          created_at?: string
          defense_status?: string
          id?: string
          keyword?: string
          last_ctr?: number | null
          last_position_drop?: number | null
          locked_at?: string | null
          page_url?: string
          position?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      ranking_deltas: {
        Row: {
          crawl_timestamp: string
          created_at: string
          ctr_after: number | null
          ctr_before: number | null
          delta_ctr: number | null
          delta_impressions: number | null
          delta_position: number | null
          id: string
          impressions_after: number | null
          impressions_before: number | null
          keyword: string
          page_url: string | null
          position_after: number | null
          position_before: number | null
          run_id: string | null
          volatility_score: number | null
        }
        Insert: {
          crawl_timestamp?: string
          created_at?: string
          ctr_after?: number | null
          ctr_before?: number | null
          delta_ctr?: number | null
          delta_impressions?: number | null
          delta_position?: number | null
          id?: string
          impressions_after?: number | null
          impressions_before?: number | null
          keyword: string
          page_url?: string | null
          position_after?: number | null
          position_before?: number | null
          run_id?: string | null
          volatility_score?: number | null
        }
        Update: {
          crawl_timestamp?: string
          created_at?: string
          ctr_after?: number | null
          ctr_before?: number | null
          delta_ctr?: number | null
          delta_impressions?: number | null
          delta_position?: number | null
          id?: string
          impressions_after?: number | null
          impressions_before?: number | null
          keyword?: string
          page_url?: string | null
          position_after?: number | null
          position_before?: number | null
          run_id?: string | null
          volatility_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ranking_deltas_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
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
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          max_uses: number | null
          owner_email: string
          owner_name: string | null
          owner_reward_value: number
          reward_type: string
          reward_value: number
          updated_at: string
          uses_count: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          owner_email: string
          owner_name?: string | null
          owner_reward_value?: number
          reward_type?: string
          reward_value?: number
          updated_at?: string
          uses_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          owner_email?: string
          owner_name?: string | null
          owner_reward_value?: number
          reward_type?: string
          reward_value?: number
          updated_at?: string
          uses_count?: number
        }
        Relationships: []
      }
      referral_uses: {
        Row: {
          created_at: string
          id: string
          referral_code_id: string
          referred_email: string
          referred_order_id: string | null
          reward_credited: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          referral_code_id: string
          referred_email: string
          referred_order_id?: string | null
          reward_credited?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          referral_code_id?: string
          referred_email?: string
          referred_order_id?: string | null
          reward_credited?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "referral_uses_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_uses_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_uses_referred_order_id_fkey"
            columns: ["referred_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      release_report_issues: {
        Row: {
          assignee_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          issue_key: string
          release_id: string
          resolved_at: string | null
          source: Database["public"]["Enums"]["release_issue_source"]
          status: Database["public"]["Enums"]["release_issue_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          issue_key: string
          release_id: string
          resolved_at?: string | null
          source?: Database["public"]["Enums"]["release_issue_source"]
          status?: Database["public"]["Enums"]["release_issue_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          issue_key?: string
          release_id?: string
          resolved_at?: string | null
          source?: Database["public"]["Enums"]["release_issue_source"]
          status?: Database["public"]["Enums"]["release_issue_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_report_issues_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "release_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      release_reports: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          notes: string | null
          reported_by: string | null
          status: string
          sync_run_id: string | null
          sync_summary: Json | null
          title: string
          updated_at: string
          validation_summary: Json | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          notes?: string | null
          reported_by?: string | null
          status?: string
          sync_run_id?: string | null
          sync_summary?: Json | null
          title: string
          updated_at?: string
          validation_summary?: Json | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          notes?: string | null
          reported_by?: string | null
          status?: string
          sync_run_id?: string | null
          sync_summary?: Json | null
          title?: string
          updated_at?: string
          validation_summary?: Json | null
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
      render_trace_alert_events: {
        Row: {
          alert_id: string
          fired_at: string
          id: string
          observed_rate: number
          observed_shell: number
          observed_timeouts: number
          scope: string
          slug: string | null
          threshold_rate: number
          window_days: number
        }
        Insert: {
          alert_id: string
          fired_at?: string
          id?: string
          observed_rate: number
          observed_shell: number
          observed_timeouts: number
          scope: string
          slug?: string | null
          threshold_rate: number
          window_days: number
        }
        Update: {
          alert_id?: string
          fired_at?: string
          id?: string
          observed_rate?: number
          observed_shell?: number
          observed_timeouts?: number
          scope?: string
          slug?: string | null
          threshold_rate?: number
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "render_trace_alert_events_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "render_trace_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      render_trace_alerts: {
        Row: {
          cooldown_minutes: number
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          last_triggered_at: string | null
          min_sample: number
          name: string
          scope: string
          slug_pattern: string | null
          threshold_rate: number
          updated_at: string
          window_days: number
        }
        Insert: {
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          last_triggered_at?: string | null
          min_sample?: number
          name: string
          scope: string
          slug_pattern?: string | null
          threshold_rate: number
          updated_at?: string
          window_days?: number
        }
        Update: {
          cooldown_minutes?: number
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          last_triggered_at?: string | null
          min_sample?: number
          name?: string
          scope?: string
          slug_pattern?: string | null
          threshold_rate?: number
          updated_at?: string
          window_days?: number
        }
        Relationships: []
      }
      replenishment_reminders: {
        Row: {
          created_at: string
          customer_email: string
          estimated_reorder_date: string
          id: string
          order_id: string
          product_id: string
          product_image: string | null
          product_name: string
          product_slug: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_email: string
          estimated_reorder_date: string
          id?: string
          order_id: string
          product_id: string
          product_image?: string | null
          product_name: string
          product_slug?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_email?: string
          estimated_reorder_date?: string
          id?: string
          order_id?: string
          product_id?: string
          product_image?: string | null
          product_name?: string
          product_slug?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "replenishment_reminders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      review_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          customer_email: string
          customer_name: string | null
          id: string
          order_id: string
          product_ids: string[]
          reminder_count: number
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          customer_email: string
          customer_name?: string | null
          id?: string
          order_id: string
          product_ids?: string[]
          reminder_count?: number
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          customer_email?: string
          customer_name?: string | null
          id?: string
          order_id?: string
          product_ids?: string[]
          reminder_count?: number
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
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
      security_anomaly_events: {
        Row: {
          created_at: string
          description: string
          details: Json | null
          event_type: string
          id: string
          resolved: boolean
          resolved_at: string | null
          service_account_key_id: string | null
          severity: string
        }
        Insert: {
          created_at?: string
          description: string
          details?: Json | null
          event_type: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          service_account_key_id?: string | null
          severity?: string
        }
        Update: {
          created_at?: string
          description?: string
          details?: Json | null
          event_type?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          service_account_key_id?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_anomaly_events_service_account_key_id_fkey"
            columns: ["service_account_key_id"]
            isOneToOne: false
            referencedRelation: "service_account_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_actions_queue: {
        Row: {
          action_type: string
          cluster_id: string | null
          created_at: string
          executed_at: string | null
          executed_by: string | null
          id: string
          payload: Json
          run_id: string | null
          status: string
          target_url: string
        }
        Insert: {
          action_type: string
          cluster_id?: string | null
          created_at?: string
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          payload?: Json
          run_id?: string | null
          status?: string
          target_url: string
        }
        Update: {
          action_type?: string
          cluster_id?: string | null
          created_at?: string
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          payload?: Json
          run_id?: string | null
          status?: string
          target_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_actions_queue_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "seo_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_actions_queue_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "seo_engine_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_clusters: {
        Row: {
          created_at: string
          id: string
          intent: string
          keywords: Json
          label: string
          primary_keyword: string
          primary_url: string | null
          secondary_urls: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          intent?: string
          keywords?: Json
          label: string
          primary_keyword: string
          primary_url?: string | null
          secondary_urls?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          intent?: string
          keywords?: Json
          label?: string
          primary_keyword?: string
          primary_url?: string | null
          secondary_urls?: Json | null
          status?: string
          updated_at?: string
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
      seo_content_drafts: {
        Row: {
          action_id: string | null
          approved_at: string | null
          approved_by: string | null
          cluster_id: string | null
          content_type: string
          created_at: string
          id: string
          internal_links: Json | null
          markdown: string | null
          meta_description: string | null
          published_at: string | null
          run_id: string | null
          schema_json: Json | null
          status: string
          title: string
          updated_at: string
          url: string
          word_count: number | null
        }
        Insert: {
          action_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          cluster_id?: string | null
          content_type?: string
          created_at?: string
          id?: string
          internal_links?: Json | null
          markdown?: string | null
          meta_description?: string | null
          published_at?: string | null
          run_id?: string | null
          schema_json?: Json | null
          status?: string
          title: string
          updated_at?: string
          url: string
          word_count?: number | null
        }
        Update: {
          action_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          cluster_id?: string | null
          content_type?: string
          created_at?: string
          id?: string
          internal_links?: Json | null
          markdown?: string | null
          meta_description?: string | null
          published_at?: string | null
          run_id?: string | null
          schema_json?: Json | null
          status?: string
          title?: string
          updated_at?: string
          url?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_content_drafts_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "seo_actions_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_content_drafts_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "seo_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_content_drafts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "seo_engine_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_engine_config: {
        Row: {
          approval_required: boolean
          auto_publish: boolean
          id: string
          max_indexing_per_day: number
          max_new_urls_per_week: number
          max_title_rewrites_per_week: number
          max_updates_per_week: number
          min_impressions_quick_win: number
          min_words_blog: number
          min_words_guide: number
          quick_win_pos_max: number
          quick_win_pos_min: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approval_required?: boolean
          auto_publish?: boolean
          id?: string
          max_indexing_per_day?: number
          max_new_urls_per_week?: number
          max_title_rewrites_per_week?: number
          max_updates_per_week?: number
          min_impressions_quick_win?: number
          min_words_blog?: number
          min_words_guide?: number
          quick_win_pos_max?: number
          quick_win_pos_min?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approval_required?: boolean
          auto_publish?: boolean
          id?: string
          max_indexing_per_day?: number
          max_new_urls_per_week?: number
          max_title_rewrites_per_week?: number
          max_updates_per_week?: number
          min_impressions_quick_win?: number
          min_words_blog?: number
          min_words_guide?: number
          quick_win_pos_max?: number
          quick_win_pos_min?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      seo_engine_runs: {
        Row: {
          actions_planned: number | null
          clusters_found: number | null
          created_at: string
          drafts_generated: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          mode: string
          started_at: string
          status: string
          summary: Json | null
          triggered_by: string | null
          urls_indexed: number | null
          urls_published: number | null
        }
        Insert: {
          actions_planned?: number | null
          clusters_found?: number | null
          created_at?: string
          drafts_generated?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          mode?: string
          started_at?: string
          status?: string
          summary?: Json | null
          triggered_by?: string | null
          urls_indexed?: number | null
          urls_published?: number | null
        }
        Update: {
          actions_planned?: number | null
          clusters_found?: number | null
          created_at?: string
          drafts_generated?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          mode?: string
          started_at?: string
          status?: string
          summary?: Json | null
          triggered_by?: string | null
          urls_indexed?: number | null
          urls_published?: number | null
        }
        Relationships: []
      }
      seo_feature_flags: {
        Row: {
          algorithm_immunity: boolean
          autonomous_growth_loop: boolean
          content_dominance: boolean
          created_at: string
          dominance_mode: boolean
          enterprise_expansion: boolean
          growth_domination: boolean
          hyper_aggressive: boolean
          id: string
          intelligence_stack: boolean
          revenue_market_capture: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          algorithm_immunity?: boolean
          autonomous_growth_loop?: boolean
          content_dominance?: boolean
          created_at?: string
          dominance_mode?: boolean
          enterprise_expansion?: boolean
          growth_domination?: boolean
          hyper_aggressive?: boolean
          id?: string
          intelligence_stack?: boolean
          revenue_market_capture?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          algorithm_immunity?: boolean
          autonomous_growth_loop?: boolean
          content_dominance?: boolean
          created_at?: string
          dominance_mode?: boolean
          enterprise_expansion?: boolean
          growth_domination?: boolean
          hyper_aggressive?: boolean
          id?: string
          intelligence_stack?: boolean
          revenue_market_capture?: boolean
          updated_at?: string
          user_id?: string
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
      seo_optimization_log: {
        Row: {
          action_details: Json
          action_type: string
          applied_at: string | null
          applied_by: string | null
          created_at: string
          id: string
          metrics_snapshot: Json
          slug: string
          status: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_details?: Json
          action_type: string
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          id?: string
          metrics_snapshot?: Json
          slug: string
          status?: string
          trigger_type: string
          updated_at?: string
        }
        Update: {
          action_details?: Json
          action_type?: string
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          id?: string
          metrics_snapshot?: Json
          slug?: string
          status?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      seo_page_metrics: {
        Row: {
          avg_position: number
          clicks: number
          created_at: string
          ctr: number
          id: string
          impressions: number
          last_updated: string
          page_type: string
          slug: string | null
          url: string
        }
        Insert: {
          avg_position?: number
          clicks?: number
          created_at?: string
          ctr?: number
          id?: string
          impressions?: number
          last_updated?: string
          page_type?: string
          slug?: string | null
          url: string
        }
        Update: {
          avg_position?: number
          clicks?: number
          created_at?: string
          ctr?: number
          id?: string
          impressions?: number
          last_updated?: string
          page_type?: string
          slug?: string | null
          url?: string
        }
        Relationships: []
      }
      seo_revenue_matrix: {
        Row: {
          action_taken: string | null
          aov: number | null
          clicks: number | null
          created_at: string
          ctr: number | null
          current_position: number | null
          defense_mode: boolean | null
          estimated_cvr: number | null
          id: string
          impressions: number | null
          keyword: string
          page_url: string | null
          revenue_potential_30d: number | null
          revenue_potential_90d: number | null
          run_id: string | null
        }
        Insert: {
          action_taken?: string | null
          aov?: number | null
          clicks?: number | null
          created_at?: string
          ctr?: number | null
          current_position?: number | null
          defense_mode?: boolean | null
          estimated_cvr?: number | null
          id?: string
          impressions?: number | null
          keyword: string
          page_url?: string | null
          revenue_potential_30d?: number | null
          revenue_potential_90d?: number | null
          run_id?: string | null
        }
        Update: {
          action_taken?: string | null
          aov?: number | null
          clicks?: number | null
          created_at?: string
          ctr?: number | null
          current_position?: number | null
          defense_mode?: boolean | null
          estimated_cvr?: number | null
          id?: string
          impressions?: number | null
          keyword?: string
          page_url?: string | null
          revenue_potential_30d?: number | null
          revenue_potential_90d?: number | null
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_revenue_matrix_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      serp_features: {
        Row: {
          action_taken: string | null
          created_at: string
          feature_type: string
          id: string
          impressions: number | null
          keyword: string
          page_url: string | null
          position: number | null
          run_id: string | null
          status: string
        }
        Insert: {
          action_taken?: string | null
          created_at?: string
          feature_type: string
          id?: string
          impressions?: number | null
          keyword: string
          page_url?: string | null
          position?: number | null
          run_id?: string | null
          status?: string
        }
        Update: {
          action_taken?: string | null
          created_at?: string
          feature_type?: string
          id?: string
          impressions?: number | null
          keyword?: string
          page_url?: string | null
          position?: number | null
          run_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "serp_features_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      service_account_keys: {
        Row: {
          account_email: string
          account_name: string
          anomaly_flags: Json | null
          api_usage_baseline: Json | null
          billing_alert_active: boolean | null
          budget_alert_configured: boolean | null
          consecutive_failures: number
          created_at: string
          essential_contacts_configured: boolean | null
          health_check_status: string | null
          iam_roles: string[] | null
          id: string
          is_active: boolean
          key_created_at: string
          key_id: string | null
          last_anomaly_check_at: string | null
          last_health_check_at: string | null
          last_rotated_at: string | null
          last_used_at: string | null
          notes: string | null
          recovery_mode: boolean
          recovery_started_at: string | null
          risk_score: number
          rotation_status: string
          service_description: string | null
          updated_at: string
        }
        Insert: {
          account_email: string
          account_name: string
          anomaly_flags?: Json | null
          api_usage_baseline?: Json | null
          billing_alert_active?: boolean | null
          budget_alert_configured?: boolean | null
          consecutive_failures?: number
          created_at?: string
          essential_contacts_configured?: boolean | null
          health_check_status?: string | null
          iam_roles?: string[] | null
          id?: string
          is_active?: boolean
          key_created_at?: string
          key_id?: string | null
          last_anomaly_check_at?: string | null
          last_health_check_at?: string | null
          last_rotated_at?: string | null
          last_used_at?: string | null
          notes?: string | null
          recovery_mode?: boolean
          recovery_started_at?: string | null
          risk_score?: number
          rotation_status?: string
          service_description?: string | null
          updated_at?: string
        }
        Update: {
          account_email?: string
          account_name?: string
          anomaly_flags?: Json | null
          api_usage_baseline?: Json | null
          billing_alert_active?: boolean | null
          budget_alert_configured?: boolean | null
          consecutive_failures?: number
          created_at?: string
          essential_contacts_configured?: boolean | null
          health_check_status?: string | null
          iam_roles?: string[] | null
          id?: string
          is_active?: boolean
          key_created_at?: string
          key_id?: string | null
          last_anomaly_check_at?: string | null
          last_health_check_at?: string | null
          last_rotated_at?: string | null
          last_used_at?: string | null
          notes?: string | null
          recovery_mode?: boolean
          recovery_started_at?: string | null
          risk_score?: number
          rotation_status?: string
          service_description?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      shopping_optimizations: {
        Row: {
          applied_at: string | null
          boost_score: number | null
          created_at: string
          google_product_category: string | null
          google_product_category_id: number | null
          id: string
          keyword_suggestions: string[] | null
          optimization_score: number | null
          optimized_description: string | null
          optimized_title: string | null
          original_description: string | null
          original_title: string | null
          product_id: string
          product_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          boost_score?: number | null
          created_at?: string
          google_product_category?: string | null
          google_product_category_id?: number | null
          id?: string
          keyword_suggestions?: string[] | null
          optimization_score?: number | null
          optimized_description?: string | null
          optimized_title?: string | null
          original_description?: string | null
          original_title?: string | null
          product_id: string
          product_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          boost_score?: number | null
          created_at?: string
          google_product_category?: string | null
          google_product_category_id?: number | null
          id?: string
          keyword_suggestions?: string[] | null
          optimization_score?: number | null
          optimized_description?: string | null
          optimized_title?: string | null
          original_description?: string | null
          original_title?: string | null
          product_id?: string
          product_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_optimizations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_optimizations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_winners: {
        Row: {
          created_at: string
          google_category: string | null
          google_category_id: number | null
          id: string
          image_issue: string | null
          image_ok: boolean | null
          keyword_suggestions: string[] | null
          optimized_description: string
          optimized_title: string
          priority_feed: boolean | null
          product_id: string
          product_type: string | null
          score: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          google_category?: string | null
          google_category_id?: number | null
          id?: string
          image_issue?: string | null
          image_ok?: boolean | null
          keyword_suggestions?: string[] | null
          optimized_description?: string
          optimized_title?: string
          priority_feed?: boolean | null
          product_id: string
          product_type?: string | null
          score?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          google_category?: string | null
          google_category_id?: number | null
          id?: string
          image_issue?: string | null
          image_ok?: boolean | null
          keyword_suggestions?: string[] | null
          optimized_description?: string
          optimized_title?: string
          priority_feed?: boolean | null
          product_id?: string
          product_type?: string | null
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_winners_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_winners_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      site_health_checks: {
        Row: {
          all_healthy: boolean
          check_type: string
          created_at: string
          id: string
          resolved_issues: string[] | null
          results: Json
          warnings: string[] | null
        }
        Insert: {
          all_healthy?: boolean
          check_type: string
          created_at?: string
          id?: string
          resolved_issues?: string[] | null
          results?: Json
          warnings?: string[] | null
        }
        Update: {
          all_healthy?: boolean
          check_type?: string
          created_at?: string
          id?: string
          resolved_issues?: string[] | null
          results?: Json
          warnings?: string[] | null
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
      sitemap_ping_log: {
        Row: {
          created_at: string
          duration_ms: number
          engine: string
          error_message: string | null
          http_status: number | null
          id: string
          reason: string | null
          run_id: string | null
          sitemap_url: string
          status: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          engine: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          reason?: string | null
          run_id?: string | null
          sitemap_url: string
          status: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          engine?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          reason?: string | null
          run_id?: string | null
          sitemap_url?: string
          status?: string
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
      strategy_evolution_log: {
        Row: {
          action_taken: string
          confidence_score: number | null
          created_at: string
          delta_impact: Json | null
          id: string
          new_value: Json | null
          previous_value: Json | null
          run_id: string | null
          stability_status: string | null
          strategy_type: string
          target_keyword: string | null
          target_url: string | null
        }
        Insert: {
          action_taken: string
          confidence_score?: number | null
          created_at?: string
          delta_impact?: Json | null
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
          run_id?: string | null
          stability_status?: string | null
          strategy_type: string
          target_keyword?: string | null
          target_url?: string | null
        }
        Update: {
          action_taken?: string
          confidence_score?: number | null
          created_at?: string
          delta_impact?: Json | null
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
          run_id?: string | null
          stability_status?: string | null
          strategy_type?: string
          target_keyword?: string | null
          target_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "strategy_evolution_log_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_state_history: {
        Row: {
          cluster_expansion_growth: number | null
          created_at: string
          ctr_growth: number | null
          gap_closure_rate: number | null
          id: string
          ranking_velocity: number | null
          reasoning: string | null
          run_id: string | null
          serp_capture_pct: number | null
          strategy_action: string | null
        }
        Insert: {
          cluster_expansion_growth?: number | null
          created_at?: string
          ctr_growth?: number | null
          gap_closure_rate?: number | null
          id?: string
          ranking_velocity?: number | null
          reasoning?: string | null
          run_id?: string | null
          serp_capture_pct?: number | null
          strategy_action?: string | null
        }
        Update: {
          cluster_expansion_growth?: number | null
          created_at?: string
          ctr_growth?: number | null
          gap_closure_rate?: number | null
          id?: string
          ranking_velocity?: number | null
          reasoning?: string | null
          run_id?: string | null
          serp_capture_pct?: number | null
          strategy_action?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "strategy_state_history_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
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
      tiktok_oauth_states: {
        Row: {
          client_ticket: string | null
          created_at: string
          expires_at: string
          redirect_to: string | null
          state: string
          user_id: string | null
        }
        Insert: {
          client_ticket?: string | null
          created_at?: string
          expires_at?: string
          redirect_to?: string | null
          state: string
          user_id?: string | null
        }
        Update: {
          client_ticket?: string | null
          created_at?: string
          expires_at?: string
          redirect_to?: string | null
          state?: string
          user_id?: string | null
        }
        Relationships: []
      }
      tiktok_oauth_tokens: {
        Row: {
          access_token: string
          avatar_url: string | null
          connected_by: string | null
          created_at: string
          display_name: string | null
          expires_at: string
          id: string
          open_id: string
          refresh_expires_at: string | null
          refresh_token: string
          scope: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          avatar_url?: string | null
          connected_by?: string | null
          created_at?: string
          display_name?: string | null
          expires_at: string
          id?: string
          open_id: string
          refresh_expires_at?: string | null
          refresh_token: string
          scope?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          avatar_url?: string | null
          connected_by?: string | null
          created_at?: string
          display_name?: string | null
          expires_at?: string
          id?: string
          open_id?: string
          refresh_expires_at?: string | null
          refresh_token?: string
          scope?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tiktok_post_queue: {
        Row: {
          caption: string
          created_at: string
          destination_link: string | null
          error_message: string | null
          hashtags: string[] | null
          id: string
          media_urls: string[] | null
          post_variant: string
          posted_at: string | null
          priority: string
          product_id: string | null
          product_name: string
          product_slug: string | null
          scheduled_at: string | null
          status: string
          thumbnail_url: string | null
          tiktok_post_id: string | null
          tracking_params: Json | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          caption: string
          created_at?: string
          destination_link?: string | null
          error_message?: string | null
          hashtags?: string[] | null
          id?: string
          media_urls?: string[] | null
          post_variant?: string
          posted_at?: string | null
          priority?: string
          product_id?: string | null
          product_name: string
          product_slug?: string | null
          scheduled_at?: string | null
          status?: string
          thumbnail_url?: string | null
          tiktok_post_id?: string | null
          tracking_params?: Json | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          caption?: string
          created_at?: string
          destination_link?: string | null
          error_message?: string | null
          hashtags?: string[] | null
          id?: string
          media_urls?: string[] | null
          post_variant?: string
          posted_at?: string | null
          priority?: string
          product_id?: string | null
          product_name?: string
          product_slug?: string | null
          scheduled_at?: string | null
          status?: string
          thumbnail_url?: string | null
          tiktok_post_id?: string | null
          tracking_params?: Json | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_post_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tiktok_post_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      tiktok_test_users: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_recording_user: boolean
          label: string | null
          notes: string | null
          open_id: string
          registered_in_dev_portal_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_recording_user?: boolean
          label?: string | null
          notes?: string | null
          open_id: string
          registered_in_dev_portal_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_recording_user?: boolean
          label?: string | null
          notes?: string | null
          open_id?: string
          registered_in_dev_portal_at?: string | null
          updated_at?: string
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
      web_vitals: {
        Row: {
          cls_value: number | null
          connection_type: string | null
          created_at: string
          device_hint: string | null
          fcp_value: number | null
          id: string
          inp_event: string | null
          inp_value: number | null
          lcp_element: string | null
          lcp_value: number | null
          path: string
          proxy_lcp_candidate: string | null
          proxy_lcp_value: number | null
          session_id: string | null
          ts: string
          ttfb_value: number | null
          ua: string | null
        }
        Insert: {
          cls_value?: number | null
          connection_type?: string | null
          created_at?: string
          device_hint?: string | null
          fcp_value?: number | null
          id?: string
          inp_event?: string | null
          inp_value?: number | null
          lcp_element?: string | null
          lcp_value?: number | null
          path: string
          proxy_lcp_candidate?: string | null
          proxy_lcp_value?: number | null
          session_id?: string | null
          ts?: string
          ttfb_value?: number | null
          ua?: string | null
        }
        Update: {
          cls_value?: number | null
          connection_type?: string | null
          created_at?: string
          device_hint?: string | null
          fcp_value?: number | null
          id?: string
          inp_event?: string | null
          inp_value?: number | null
          lcp_element?: string | null
          lcp_value?: number | null
          path?: string
          proxy_lcp_candidate?: string | null
          proxy_lcp_value?: number | null
          session_id?: string | null
          ts?: string
          ttfb_value?: number | null
          ua?: string | null
        }
        Relationships: []
      }
      zero_click_pages: {
        Row: {
          created_at: string
          has_comparison_table: boolean | null
          has_definition_schema: boolean | null
          has_direct_answer: boolean | null
          has_quick_answer: boolean | null
          id: string
          last_checked_at: string | null
          page_url: string
          slug: string | null
          updated_at: string | null
          visibility_score: number | null
          zero_click_ready: boolean | null
        }
        Insert: {
          created_at?: string
          has_comparison_table?: boolean | null
          has_definition_schema?: boolean | null
          has_direct_answer?: boolean | null
          has_quick_answer?: boolean | null
          id?: string
          last_checked_at?: string | null
          page_url: string
          slug?: string | null
          updated_at?: string | null
          visibility_score?: number | null
          zero_click_ready?: boolean | null
        }
        Update: {
          created_at?: string
          has_comparison_table?: boolean | null
          has_definition_schema?: boolean | null
          has_direct_answer?: boolean | null
          has_quick_answer?: boolean | null
          id?: string
          last_checked_at?: string | null
          page_url?: string
          slug?: string | null
          updated_at?: string | null
          visibility_score?: number | null
          zero_click_ready?: boolean | null
        }
        Relationships: []
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
          primary_intent: string | null
          primary_species: string | null
          seo_tier: string | null
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
          primary_intent?: string | null
          primary_species?: string | null
          seo_tier?: string | null
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
          primary_intent?: string | null
          primary_species?: string | null
          seo_tier?: string | null
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
      referral_codes_public: {
        Row: {
          code: string | null
          id: string | null
          is_active: boolean | null
          reward_type: string | null
          reward_value: number | null
        }
        Insert: {
          code?: string | null
          id?: string | null
          is_active?: boolean | null
          reward_type?: string | null
          reward_value?: number | null
        }
        Update: {
          code?: string | null
          id?: string | null
          is_active?: boolean | null
          reward_type?: string | null
          reward_value?: number | null
        }
        Relationships: []
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
      cleanup_old_health_checks: { Args: never; Returns: undefined }
      cleanup_old_visitor_activity: { Args: never; Returns: undefined }
      cleanup_old_web_vitals: { Args: never; Returns: undefined }
      cleanup_preview_visitor_activity: { Args: never; Returns: number }
      evaluate_render_trace_alerts: {
        Args: { p_record?: boolean }
        Returns: Json
      }
      generate_product_slug: { Args: { product_name: string }; Returns: string }
      get_crawler_sampling_decision_stats: {
        Args: { p_limit?: number; p_window_hours?: number }
        Returns: Json
      }
      get_crawler_sampling_last_hour: {
        Args: { p_minutes?: number; p_top_pages?: number }
        Returns: Json
      }
      get_render_trace_slug_timeline: {
        Args: { p_slug: string; p_window_days?: number }
        Returns: Json
      }
      get_render_trace_stats: {
        Args: {
          p_malformed_limit?: number
          p_search?: string
          p_slug_limit?: number
          p_slug_offset?: number
          p_window_days?: number
        }
        Returns: Json
      }
      get_tiktok_bio_split:
        | { Args: { p_window_days?: number }; Returns: Json }
        | {
            Args: { p_include_excluded?: boolean; p_window_days?: number }
            Returns: Json
          }
      get_tiktok_excluded_sessions:
        | {
            Args: {
              p_limit?: number
              p_offset?: number
              p_rule?: string
              p_window_days?: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_include_excluded?: boolean
              p_limit?: number
              p_offset?: number
              p_rule?: string
              p_window_days?: number
            }
            Returns: Json
          }
      get_tiktok_hook_performance:
        | {
            Args: { p_campaign_pattern?: string; p_window_days?: number }
            Returns: Json
          }
        | {
            Args: {
              p_campaign_pattern?: string
              p_include_excluded?: boolean
              p_window_days?: number
            }
            Returns: Json
          }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_admin_assignees: {
        Args: never
        Returns: {
          display_name: string
          email: string
          id: string
        }[]
      }
      test_tiktok_exclusion_fixtures: {
        Args: { p_prefix: string }
        Returns: Json
      }
      update_session_heartbeat: {
        Args: { p_session_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "customer"
      release_issue_source: "validation_fail" | "custom"
      release_issue_status: "open" | "in_progress" | "resolved"
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
      release_issue_source: ["validation_fail", "custom"],
      release_issue_status: ["open", "in_progress", "resolved"],
    },
  },
} as const
