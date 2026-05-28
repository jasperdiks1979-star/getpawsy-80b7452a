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
      ad_spend_entries: {
        Row: {
          add_to_cart: number
          campaign: string | null
          clicks: number
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          impressions: number
          pin_id: string | null
          platform: string
          product_id: string | null
          purchases: number
          revenue: number
          spend: number
        }
        Insert: {
          add_to_cart?: number
          campaign?: string | null
          clicks?: number
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          impressions?: number
          pin_id?: string | null
          platform?: string
          product_id?: string | null
          purchases?: number
          revenue?: number
          spend?: number
        }
        Update: {
          add_to_cart?: number
          campaign?: string | null
          clicks?: number
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          impressions?: number
          pin_id?: string | null
          platform?: string
          product_id?: string | null
          purchases?: number
          revenue?: number
          spend?: number
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
      admin_secrets: {
        Row: {
          name: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          name: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          name?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
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
      ai_content_drafts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          model: string | null
          output: string
          product_id: string | null
          product_name: string | null
          prompt: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          model?: string | null
          output: string
          product_id?: string | null
          product_name?: string | null
          prompt?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          model?: string | null
          output?: string
          product_id?: string | null
          product_name?: string | null
          prompt?: string | null
          status?: string
        }
        Relationships: []
      }
      ai_creative_drafts: {
        Row: {
          body: string | null
          confidence: number | null
          created_at: string
          dismissed_at: string | null
          evidence: Json
          expected_revenue_impact: string | null
          generated_at: string
          id: string
          kind: string
          model: string | null
          prompt_hash: string | null
          published_at: string | null
          quality_flags: Json
          quality_score: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_ref: string | null
          title: string
          traffic_source: string | null
          updated_at: string
          variants: Json
        }
        Insert: {
          body?: string | null
          confidence?: number | null
          created_at?: string
          dismissed_at?: string | null
          evidence?: Json
          expected_revenue_impact?: string | null
          generated_at?: string
          id?: string
          kind: string
          model?: string | null
          prompt_hash?: string | null
          published_at?: string | null
          quality_flags?: Json
          quality_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_ref?: string | null
          title: string
          traffic_source?: string | null
          updated_at?: string
          variants?: Json
        }
        Update: {
          body?: string | null
          confidence?: number | null
          created_at?: string
          dismissed_at?: string | null
          evidence?: Json
          expected_revenue_impact?: string | null
          generated_at?: string
          id?: string
          kind?: string
          model?: string | null
          prompt_hash?: string | null
          published_at?: string | null
          quality_flags?: Json
          quality_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_ref?: string | null
          title?: string
          traffic_source?: string | null
          updated_at?: string
          variants?: Json
        }
        Relationships: []
      }
      ai_executive_snapshots: {
        Row: {
          ai_summary: string | null
          anomalies: Json
          generated_at: string
          generated_by: string | null
          id: string
          losers: Json
          revenue_health: Json
          snapshot_date: string
          top_sources: Json
          traffic_quality: Json
          window_days: number
          winners: Json
        }
        Insert: {
          ai_summary?: string | null
          anomalies?: Json
          generated_at?: string
          generated_by?: string | null
          id?: string
          losers?: Json
          revenue_health?: Json
          snapshot_date?: string
          top_sources?: Json
          traffic_quality?: Json
          window_days?: number
          winners?: Json
        }
        Update: {
          ai_summary?: string | null
          anomalies?: Json
          generated_at?: string
          generated_by?: string | null
          id?: string
          losers?: Json
          revenue_health?: Json
          snapshot_date?: string
          top_sources?: Json
          traffic_quality?: Json
          window_days?: number
          winners?: Json
        }
        Relationships: []
      }
      ai_merchandising_recommendations: {
        Row: {
          confidence: number | null
          current_state: Json | null
          evidence: Json
          expected_impact: number | null
          generated_at: string
          id: string
          reason: string | null
          rec_type: string
          status: string
          suggested_state: Json
          target_ref: string | null
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          current_state?: Json | null
          evidence?: Json
          expected_impact?: number | null
          generated_at?: string
          id?: string
          reason?: string | null
          rec_type: string
          status?: string
          suggested_state?: Json
          target_ref?: string | null
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          current_state?: Json | null
          evidence?: Json
          expected_impact?: number | null
          generated_at?: string
          id?: string
          reason?: string | null
          rec_type?: string
          status?: string
          suggested_state?: Json
          target_ref?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_priority_queue: {
        Row: {
          category: string
          confidence: number | null
          dedupe_key: string | null
          difficulty: number | null
          evidence: Json
          expected_revenue_impact: number | null
          generated_at: string
          id: string
          priority_score: number
          recommended_action: string | null
          snooze_until: string | null
          source_kind: string
          source_ref: string | null
          status: string
          summary: string | null
          title: string
          traffic_size: number | null
          updated_at: string
        }
        Insert: {
          category: string
          confidence?: number | null
          dedupe_key?: string | null
          difficulty?: number | null
          evidence?: Json
          expected_revenue_impact?: number | null
          generated_at?: string
          id?: string
          priority_score?: number
          recommended_action?: string | null
          snooze_until?: string | null
          source_kind: string
          source_ref?: string | null
          status?: string
          summary?: string | null
          title: string
          traffic_size?: number | null
          updated_at?: string
        }
        Update: {
          category?: string
          confidence?: number | null
          dedupe_key?: string | null
          difficulty?: number | null
          evidence?: Json
          expected_revenue_impact?: number | null
          generated_at?: string
          id?: string
          priority_score?: number
          recommended_action?: string | null
          snooze_until?: string | null
          source_kind?: string
          source_ref?: string | null
          status?: string
          summary?: string | null
          title?: string
          traffic_size?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_revenue_insights: {
        Row: {
          body: string
          created_at: string
          dismissed_at: string | null
          dismissed_by: string | null
          evidence: Json
          generated_at: string
          id: string
          insight_type: string
          model: string | null
          prompt_hash: string | null
          recommendations: Json
          scope: string
          scope_ref: string | null
          severity: string
          snoozed_until: string | null
          title: string
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          body: string
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          evidence?: Json
          generated_at?: string
          id?: string
          insight_type: string
          model?: string | null
          prompt_hash?: string | null
          recommendations?: Json
          scope: string
          scope_ref?: string | null
          severity?: string
          snoozed_until?: string | null
          title: string
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          evidence?: Json
          generated_at?: string
          id?: string
          insight_type?: string
          model?: string | null
          prompt_hash?: string | null
          recommendations?: Json
          scope?: string
          scope_ref?: string | null
          severity?: string
          snoozed_until?: string | null
          title?: string
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      ai_revenue_recommendations: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          metric_snapshot: Json | null
          page_path: string | null
          product_id: string | null
          severity: string
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          id?: string
          metric_snapshot?: Json | null
          page_path?: string | null
          product_id?: string | null
          severity?: string
          source?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          metric_snapshot?: Json | null
          page_path?: string | null
          product_id?: string | null
          severity?: string
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_seo_drafts: {
        Row: {
          affected_url: string | null
          body: string | null
          confidence: number | null
          created_at: string
          dismissed_at: string | null
          evidence: Json
          expected_seo_impact: string | null
          generated_at: string
          id: string
          kind: string
          model: string | null
          priority: string
          prompt_hash: string | null
          published_at: string | null
          quality_flags: Json
          quality_score: number | null
          recommendations: Json
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          affected_url?: string | null
          body?: string | null
          confidence?: number | null
          created_at?: string
          dismissed_at?: string | null
          evidence?: Json
          expected_seo_impact?: string | null
          generated_at?: string
          id?: string
          kind: string
          model?: string | null
          priority?: string
          prompt_hash?: string | null
          published_at?: string | null
          quality_flags?: Json
          quality_score?: number | null
          recommendations?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          affected_url?: string | null
          body?: string | null
          confidence?: number | null
          created_at?: string
          dismissed_at?: string | null
          evidence?: Json
          expected_seo_impact?: string | null
          generated_at?: string
          id?: string
          kind?: string
          model?: string | null
          priority?: string
          prompt_hash?: string | null
          published_at?: string | null
          quality_flags?: Json
          quality_score?: number | null
          recommendations?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      analytics_quarantine: {
        Row: {
          created_at: string
          id: string
          ip_hash: string | null
          page_path: string | null
          payload: Json
          reasons: string[]
          referrer: string | null
          session_id: string | null
          source: string
          user_agent: string | null
          utm_source: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_hash?: string | null
          page_path?: string | null
          payload?: Json
          reasons?: string[]
          referrer?: string | null
          session_id?: string | null
          source: string
          user_agent?: string | null
          utm_source?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_hash?: string | null
          page_path?: string | null
          payload?: Json
          reasons?: string[]
          referrer?: string | null
          session_id?: string | null
          source?: string
          user_agent?: string | null
          utm_source?: string | null
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
      background_jobs: {
        Row: {
          cancel_requested: boolean
          completed: number
          created_at: string
          created_by: string | null
          error: string | null
          failed: number
          finished_at: string | null
          id: string
          kind: string
          params: Json
          results: Json
          started_at: string | null
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          cancel_requested?: boolean
          completed?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          kind: string
          params?: Json
          results?: Json
          started_at?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          cancel_requested?: boolean
          completed?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          kind?: string
          params?: Json
          results?: Json
          started_at?: string | null
          status?: string
          total?: number
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
      checkout_funnel_events: {
        Row: {
          bot_reason: string | null
          cart_id: string | null
          created_at: string
          currency: string | null
          destination_url: string | null
          error_reason: string | null
          event_source: string | null
          geo_quality: string | null
          id: string
          idempotency_key: string | null
          is_bot: boolean | null
          is_klarna: boolean | null
          item_count: number | null
          metadata: Json | null
          payment_method: string | null
          session_id: string | null
          source: string | null
          source_component: string | null
          step: string
          stripe_session_id: string | null
          user_action_id: string | null
          user_id: string | null
          value: number | null
        }
        Insert: {
          bot_reason?: string | null
          cart_id?: string | null
          created_at?: string
          currency?: string | null
          destination_url?: string | null
          error_reason?: string | null
          event_source?: string | null
          geo_quality?: string | null
          id?: string
          idempotency_key?: string | null
          is_bot?: boolean | null
          is_klarna?: boolean | null
          item_count?: number | null
          metadata?: Json | null
          payment_method?: string | null
          session_id?: string | null
          source?: string | null
          source_component?: string | null
          step: string
          stripe_session_id?: string | null
          user_action_id?: string | null
          user_id?: string | null
          value?: number | null
        }
        Update: {
          bot_reason?: string | null
          cart_id?: string | null
          created_at?: string
          currency?: string | null
          destination_url?: string | null
          error_reason?: string | null
          event_source?: string | null
          geo_quality?: string | null
          id?: string
          idempotency_key?: string | null
          is_bot?: boolean | null
          is_klarna?: boolean | null
          item_count?: number | null
          metadata?: Json | null
          payment_method?: string | null
          session_id?: string | null
          source?: string | null
          source_component?: string | null
          step?: string
          stripe_session_id?: string | null
          user_action_id?: string | null
          user_id?: string | null
          value?: number | null
        }
        Relationships: []
      }
      cinematic_ad_alert_log: {
        Row: {
          alert_type: string
          created_at: string
          dedupe_key: string
          details: Json
          email_error: string | null
          email_sent: boolean
          function_name: string | null
          id: string
          job_id: string | null
          severity: string
          summary: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          dedupe_key: string
          details?: Json
          email_error?: string | null
          email_sent?: boolean
          function_name?: string | null
          id?: string
          job_id?: string | null
          severity?: string
          summary: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          dedupe_key?: string
          details?: Json
          email_error?: string | null
          email_sent?: boolean
          function_name?: string | null
          id?: string
          job_id?: string | null
          severity?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "cinematic_ad_alert_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cinematic_ad_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cinematic_ad_alert_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cinematic_ad_pipeline_tracking"
            referencedColumns: ["id"]
          },
        ]
      }
      cinematic_ad_alert_settings: {
        Row: {
          channel: string
          enabled: boolean
          failure_lookback_minutes: number
          id: number
          queued_threshold_minutes: number
          recipient_email: string
          rendering_threshold_minutes: number
          updated_at: string
        }
        Insert: {
          channel?: string
          enabled?: boolean
          failure_lookback_minutes?: number
          id?: number
          queued_threshold_minutes?: number
          recipient_email?: string
          rendering_threshold_minutes?: number
          updated_at?: string
        }
        Update: {
          channel?: string
          enabled?: boolean
          failure_lookback_minutes?: number
          id?: number
          queued_threshold_minutes?: number
          recipient_email?: string
          rendering_threshold_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      cinematic_ad_audit_events: {
        Row: {
          action: string
          actor: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          id: string
          job_id: string | null
          reason: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          id?: string
          job_id?: string | null
          reason?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          id?: string
          job_id?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      cinematic_ad_job_events: {
        Row: {
          action_taken: string | null
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          job_id: string | null
          new_status: string | null
          payload: Json
          previous_status: string | null
          recovery_result: string | null
          trace_id: string | null
        }
        Insert: {
          action_taken?: string | null
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          job_id?: string | null
          new_status?: string | null
          payload?: Json
          previous_status?: string | null
          recovery_result?: string | null
          trace_id?: string | null
        }
        Update: {
          action_taken?: string | null
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          job_id?: string | null
          new_status?: string | null
          payload?: Json
          previous_status?: string | null
          recovery_result?: string | null
          trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cinematic_ad_job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cinematic_ad_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cinematic_ad_job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cinematic_ad_pipeline_tracking"
            referencedColumns: ["id"]
          },
        ]
      }
      cinematic_ad_jobs: {
        Row: {
          admin_review_reason: string | null
          ai_decisions: Json
          approval_confidence: number | null
          approval_source: string | null
          approved_at: string | null
          approved_by: string | null
          approved_for_render: boolean
          archive_reason: string | null
          archived_at: string | null
          auto_approval_blocked_reason: string | null
          auto_approval_reason: string | null
          auto_approved_at: string | null
          auto_publish: boolean
          autopilot: boolean
          autopilot_log: Json
          autopilot_threshold: number
          beat_signature: string | null
          beats_v5: Json | null
          camera_motion_score: number | null
          camera_style: string | null
          caption_variants: Json
          caption_visibility_score: number | null
          captions_visible: boolean | null
          category_match_passed: boolean | null
          cinematic_quality_score: number | null
          classification_confidence: number | null
          confidence_scores: Json
          content_type: string | null
          created_at: string
          created_by: string | null
          creative_category: string | null
          creative_quality_score: number | null
          creative_reject_reason: string | null
          cta_clarity_score: number | null
          cta_text: string | null
          cta_variants_meta: Json
          duplicate_risk_score: number
          duration_auto_trimmed: boolean
          duration_valid: boolean | null
          emotional_arc_score: number | null
          emotional_register: string | null
          engagement_pacing_score: number | null
          engine_version: string | null
          environment_flags: string[] | null
          error_message: string | null
          expected_impact: string | null
          failure_category: string | null
          first_frame_originality_score: number | null
          first3s_phash: string | null
          focal_bbox: Json | null
          has_vo: boolean | null
          hashtags: string[]
          hook_archetype: string | null
          hook_cooldown_until: string | null
          hook_strength_score: number | null
          hook_text: string | null
          hook_type: string | null
          hook_uniqueness_score: number | null
          hook_variant: string
          hook_variant_id: string | null
          hook_variants: Json | null
          hook_variants_meta: Json
          human_flags: Json | null
          human_presence_ratio: number | null
          humanization_seed: string | null
          id: string
          last_pinterest_attempt_at: string | null
          last_publish_queue_at: string | null
          media_hash: string | null
          media_type: string | null
          media_warnings: Json
          mobile_readability_score: number | null
          motion_diversity_score: number | null
          motion_entropy_score: number | null
          motion_exists: boolean | null
          motion_score: number | null
          music_track_id: string | null
          music_url: string | null
          needs_admin_review: boolean
          original_duration_seconds: number | null
          output_black_bars: boolean | null
          output_duration_seconds: number | null
          output_file_size_bytes: number | null
          output_height: number | null
          output_mp4_url: string | null
          output_thumbnail_url: string | null
          output_width: number | null
          overlay_text: string[] | null
          overlay_text_hash: string | null
          pacing_quality_score: number | null
          pin_description: string | null
          pin_destination_url: string | null
          pin_finished_at: string | null
          pin_last_error: string | null
          pin_publish_attempts: number | null
          pin_started_at: string | null
          pin_title: string | null
          pinterest_asset_id: string | null
          pinterest_live_pin_url: string | null
          pinterest_pin_id: string | null
          pinterest_pin_url: string | null
          pinterest_publish_attempts: number
          pinterest_publish_error: string | null
          pinterest_publish_status: string
          pinterest_uploaded_at: string | null
          pipeline_stage: string | null
          predicted_engagement: number | null
          prepared_at: string | null
          preset: string
          product_cooldown_until: string | null
          product_id: string | null
          product_ids: string[] | null
          product_lock: Json
          product_name: string | null
          product_price: string | null
          product_slug: string
          product_url: string | null
          publish_blocked_reason: string | null
          publish_window_bypass: boolean
          publishable_reason: string | null
          published_at: string | null
          pushed_to_pinterest_at: string | null
          qa_breakdown: Json | null
          qa_composite_score: number | null
          qa_decision_reason: string | null
          qa_preview_flags: Json | null
          qa_preview_url: string | null
          qa_report: Json
          qa_score: number | null
          qa_threshold_applied: number | null
          quarantined_assets: Json | null
          realism_consistency_score: number | null
          realism_score: number | null
          recommended_fix: string | null
          recoverable: boolean | null
          remote_exists: boolean | null
          render_attempts: number
          render_complete_at: string | null
          render_dispatched_at: string | null
          render_heartbeat_at: string | null
          render_log: Json
          render_mode: string | null
          render_priority_score: number | null
          render_queued_at: string | null
          render_started_at: string | null
          render_token: string | null
          render_worker_id: string | null
          rendered_at: string | null
          retention_likelihood_score: number | null
          risk_level: string | null
          root_cause: string | null
          scene_assets: Json
          scene_change_count: number | null
          scene_entropy_score: number | null
          scene_plan: Json | null
          scene_roles: Json | null
          scene_specs: Json
          scene_template: string | null
          scheduled_publish_at: string | null
          selected_cta_index: number
          selected_hook_index: number
          smart_retry_count: number
          status: string
          status_message: string | null
          storyboard: Json
          style_preset: string | null
          style_preset_key: string | null
          style_rejection_reason: string | null
          subhook_text: string | null
          text_safe_area_passed: boolean | null
          thumb_stop_score: number | null
          thumbnail_entropy_score: number | null
          thumbnail_phash: string | null
          trim_attempted_at: string | null
          trim_ffmpeg_exit_code: number | null
          trim_workflow_run_id: string | null
          ugc_authenticity_score: number | null
          uniqueness_score: number | null
          updated_at: string
          v4_reject_reasons: Json | null
          v5_reject_reasons: string[] | null
          validation_passed: boolean | null
          validation_report: Json | null
          validation_v4_passed: boolean | null
          validation_v5_passed: boolean | null
          variant_index: number
          variation_signature: string | null
          verified_at: string | null
          video_corrupted: boolean
          visual_energy_score: number | null
          visual_uniqueness_score: number | null
          vo_script: string | null
          vo_script_variants: Json
          vo_url: string | null
          voice_id: string
          voice_style: string | null
          voiceover_error: Json | null
          voiceover_last_attempt_at: string | null
          voiceover_script: Json | null
          voiceover_url: string | null
          voiceover_voice_id: string | null
          worker_last_error: string | null
        }
        Insert: {
          admin_review_reason?: string | null
          ai_decisions?: Json
          approval_confidence?: number | null
          approval_source?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_for_render?: boolean
          archive_reason?: string | null
          archived_at?: string | null
          auto_approval_blocked_reason?: string | null
          auto_approval_reason?: string | null
          auto_approved_at?: string | null
          auto_publish?: boolean
          autopilot?: boolean
          autopilot_log?: Json
          autopilot_threshold?: number
          beat_signature?: string | null
          beats_v5?: Json | null
          camera_motion_score?: number | null
          camera_style?: string | null
          caption_variants?: Json
          caption_visibility_score?: number | null
          captions_visible?: boolean | null
          category_match_passed?: boolean | null
          cinematic_quality_score?: number | null
          classification_confidence?: number | null
          confidence_scores?: Json
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          creative_category?: string | null
          creative_quality_score?: number | null
          creative_reject_reason?: string | null
          cta_clarity_score?: number | null
          cta_text?: string | null
          cta_variants_meta?: Json
          duplicate_risk_score?: number
          duration_auto_trimmed?: boolean
          duration_valid?: boolean | null
          emotional_arc_score?: number | null
          emotional_register?: string | null
          engagement_pacing_score?: number | null
          engine_version?: string | null
          environment_flags?: string[] | null
          error_message?: string | null
          expected_impact?: string | null
          failure_category?: string | null
          first_frame_originality_score?: number | null
          first3s_phash?: string | null
          focal_bbox?: Json | null
          has_vo?: boolean | null
          hashtags?: string[]
          hook_archetype?: string | null
          hook_cooldown_until?: string | null
          hook_strength_score?: number | null
          hook_text?: string | null
          hook_type?: string | null
          hook_uniqueness_score?: number | null
          hook_variant?: string
          hook_variant_id?: string | null
          hook_variants?: Json | null
          hook_variants_meta?: Json
          human_flags?: Json | null
          human_presence_ratio?: number | null
          humanization_seed?: string | null
          id?: string
          last_pinterest_attempt_at?: string | null
          last_publish_queue_at?: string | null
          media_hash?: string | null
          media_type?: string | null
          media_warnings?: Json
          mobile_readability_score?: number | null
          motion_diversity_score?: number | null
          motion_entropy_score?: number | null
          motion_exists?: boolean | null
          motion_score?: number | null
          music_track_id?: string | null
          music_url?: string | null
          needs_admin_review?: boolean
          original_duration_seconds?: number | null
          output_black_bars?: boolean | null
          output_duration_seconds?: number | null
          output_file_size_bytes?: number | null
          output_height?: number | null
          output_mp4_url?: string | null
          output_thumbnail_url?: string | null
          output_width?: number | null
          overlay_text?: string[] | null
          overlay_text_hash?: string | null
          pacing_quality_score?: number | null
          pin_description?: string | null
          pin_destination_url?: string | null
          pin_finished_at?: string | null
          pin_last_error?: string | null
          pin_publish_attempts?: number | null
          pin_started_at?: string | null
          pin_title?: string | null
          pinterest_asset_id?: string | null
          pinterest_live_pin_url?: string | null
          pinterest_pin_id?: string | null
          pinterest_pin_url?: string | null
          pinterest_publish_attempts?: number
          pinterest_publish_error?: string | null
          pinterest_publish_status?: string
          pinterest_uploaded_at?: string | null
          pipeline_stage?: string | null
          predicted_engagement?: number | null
          prepared_at?: string | null
          preset?: string
          product_cooldown_until?: string | null
          product_id?: string | null
          product_ids?: string[] | null
          product_lock?: Json
          product_name?: string | null
          product_price?: string | null
          product_slug: string
          product_url?: string | null
          publish_blocked_reason?: string | null
          publish_window_bypass?: boolean
          publishable_reason?: string | null
          published_at?: string | null
          pushed_to_pinterest_at?: string | null
          qa_breakdown?: Json | null
          qa_composite_score?: number | null
          qa_decision_reason?: string | null
          qa_preview_flags?: Json | null
          qa_preview_url?: string | null
          qa_report?: Json
          qa_score?: number | null
          qa_threshold_applied?: number | null
          quarantined_assets?: Json | null
          realism_consistency_score?: number | null
          realism_score?: number | null
          recommended_fix?: string | null
          recoverable?: boolean | null
          remote_exists?: boolean | null
          render_attempts?: number
          render_complete_at?: string | null
          render_dispatched_at?: string | null
          render_heartbeat_at?: string | null
          render_log?: Json
          render_mode?: string | null
          render_priority_score?: number | null
          render_queued_at?: string | null
          render_started_at?: string | null
          render_token?: string | null
          render_worker_id?: string | null
          rendered_at?: string | null
          retention_likelihood_score?: number | null
          risk_level?: string | null
          root_cause?: string | null
          scene_assets?: Json
          scene_change_count?: number | null
          scene_entropy_score?: number | null
          scene_plan?: Json | null
          scene_roles?: Json | null
          scene_specs?: Json
          scene_template?: string | null
          scheduled_publish_at?: string | null
          selected_cta_index?: number
          selected_hook_index?: number
          smart_retry_count?: number
          status?: string
          status_message?: string | null
          storyboard?: Json
          style_preset?: string | null
          style_preset_key?: string | null
          style_rejection_reason?: string | null
          subhook_text?: string | null
          text_safe_area_passed?: boolean | null
          thumb_stop_score?: number | null
          thumbnail_entropy_score?: number | null
          thumbnail_phash?: string | null
          trim_attempted_at?: string | null
          trim_ffmpeg_exit_code?: number | null
          trim_workflow_run_id?: string | null
          ugc_authenticity_score?: number | null
          uniqueness_score?: number | null
          updated_at?: string
          v4_reject_reasons?: Json | null
          v5_reject_reasons?: string[] | null
          validation_passed?: boolean | null
          validation_report?: Json | null
          validation_v4_passed?: boolean | null
          validation_v5_passed?: boolean | null
          variant_index?: number
          variation_signature?: string | null
          verified_at?: string | null
          video_corrupted?: boolean
          visual_energy_score?: number | null
          visual_uniqueness_score?: number | null
          vo_script?: string | null
          vo_script_variants?: Json
          vo_url?: string | null
          voice_id?: string
          voice_style?: string | null
          voiceover_error?: Json | null
          voiceover_last_attempt_at?: string | null
          voiceover_script?: Json | null
          voiceover_url?: string | null
          voiceover_voice_id?: string | null
          worker_last_error?: string | null
        }
        Update: {
          admin_review_reason?: string | null
          ai_decisions?: Json
          approval_confidence?: number | null
          approval_source?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_for_render?: boolean
          archive_reason?: string | null
          archived_at?: string | null
          auto_approval_blocked_reason?: string | null
          auto_approval_reason?: string | null
          auto_approved_at?: string | null
          auto_publish?: boolean
          autopilot?: boolean
          autopilot_log?: Json
          autopilot_threshold?: number
          beat_signature?: string | null
          beats_v5?: Json | null
          camera_motion_score?: number | null
          camera_style?: string | null
          caption_variants?: Json
          caption_visibility_score?: number | null
          captions_visible?: boolean | null
          category_match_passed?: boolean | null
          cinematic_quality_score?: number | null
          classification_confidence?: number | null
          confidence_scores?: Json
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          creative_category?: string | null
          creative_quality_score?: number | null
          creative_reject_reason?: string | null
          cta_clarity_score?: number | null
          cta_text?: string | null
          cta_variants_meta?: Json
          duplicate_risk_score?: number
          duration_auto_trimmed?: boolean
          duration_valid?: boolean | null
          emotional_arc_score?: number | null
          emotional_register?: string | null
          engagement_pacing_score?: number | null
          engine_version?: string | null
          environment_flags?: string[] | null
          error_message?: string | null
          expected_impact?: string | null
          failure_category?: string | null
          first_frame_originality_score?: number | null
          first3s_phash?: string | null
          focal_bbox?: Json | null
          has_vo?: boolean | null
          hashtags?: string[]
          hook_archetype?: string | null
          hook_cooldown_until?: string | null
          hook_strength_score?: number | null
          hook_text?: string | null
          hook_type?: string | null
          hook_uniqueness_score?: number | null
          hook_variant?: string
          hook_variant_id?: string | null
          hook_variants?: Json | null
          hook_variants_meta?: Json
          human_flags?: Json | null
          human_presence_ratio?: number | null
          humanization_seed?: string | null
          id?: string
          last_pinterest_attempt_at?: string | null
          last_publish_queue_at?: string | null
          media_hash?: string | null
          media_type?: string | null
          media_warnings?: Json
          mobile_readability_score?: number | null
          motion_diversity_score?: number | null
          motion_entropy_score?: number | null
          motion_exists?: boolean | null
          motion_score?: number | null
          music_track_id?: string | null
          music_url?: string | null
          needs_admin_review?: boolean
          original_duration_seconds?: number | null
          output_black_bars?: boolean | null
          output_duration_seconds?: number | null
          output_file_size_bytes?: number | null
          output_height?: number | null
          output_mp4_url?: string | null
          output_thumbnail_url?: string | null
          output_width?: number | null
          overlay_text?: string[] | null
          overlay_text_hash?: string | null
          pacing_quality_score?: number | null
          pin_description?: string | null
          pin_destination_url?: string | null
          pin_finished_at?: string | null
          pin_last_error?: string | null
          pin_publish_attempts?: number | null
          pin_started_at?: string | null
          pin_title?: string | null
          pinterest_asset_id?: string | null
          pinterest_live_pin_url?: string | null
          pinterest_pin_id?: string | null
          pinterest_pin_url?: string | null
          pinterest_publish_attempts?: number
          pinterest_publish_error?: string | null
          pinterest_publish_status?: string
          pinterest_uploaded_at?: string | null
          pipeline_stage?: string | null
          predicted_engagement?: number | null
          prepared_at?: string | null
          preset?: string
          product_cooldown_until?: string | null
          product_id?: string | null
          product_ids?: string[] | null
          product_lock?: Json
          product_name?: string | null
          product_price?: string | null
          product_slug?: string
          product_url?: string | null
          publish_blocked_reason?: string | null
          publish_window_bypass?: boolean
          publishable_reason?: string | null
          published_at?: string | null
          pushed_to_pinterest_at?: string | null
          qa_breakdown?: Json | null
          qa_composite_score?: number | null
          qa_decision_reason?: string | null
          qa_preview_flags?: Json | null
          qa_preview_url?: string | null
          qa_report?: Json
          qa_score?: number | null
          qa_threshold_applied?: number | null
          quarantined_assets?: Json | null
          realism_consistency_score?: number | null
          realism_score?: number | null
          recommended_fix?: string | null
          recoverable?: boolean | null
          remote_exists?: boolean | null
          render_attempts?: number
          render_complete_at?: string | null
          render_dispatched_at?: string | null
          render_heartbeat_at?: string | null
          render_log?: Json
          render_mode?: string | null
          render_priority_score?: number | null
          render_queued_at?: string | null
          render_started_at?: string | null
          render_token?: string | null
          render_worker_id?: string | null
          rendered_at?: string | null
          retention_likelihood_score?: number | null
          risk_level?: string | null
          root_cause?: string | null
          scene_assets?: Json
          scene_change_count?: number | null
          scene_entropy_score?: number | null
          scene_plan?: Json | null
          scene_roles?: Json | null
          scene_specs?: Json
          scene_template?: string | null
          scheduled_publish_at?: string | null
          selected_cta_index?: number
          selected_hook_index?: number
          smart_retry_count?: number
          status?: string
          status_message?: string | null
          storyboard?: Json
          style_preset?: string | null
          style_preset_key?: string | null
          style_rejection_reason?: string | null
          subhook_text?: string | null
          text_safe_area_passed?: boolean | null
          thumb_stop_score?: number | null
          thumbnail_entropy_score?: number | null
          thumbnail_phash?: string | null
          trim_attempted_at?: string | null
          trim_ffmpeg_exit_code?: number | null
          trim_workflow_run_id?: string | null
          ugc_authenticity_score?: number | null
          uniqueness_score?: number | null
          updated_at?: string
          v4_reject_reasons?: Json | null
          v5_reject_reasons?: string[] | null
          validation_passed?: boolean | null
          validation_report?: Json | null
          validation_v4_passed?: boolean | null
          validation_v5_passed?: boolean | null
          variant_index?: number
          variation_signature?: string | null
          verified_at?: string | null
          video_corrupted?: boolean
          visual_energy_score?: number | null
          visual_uniqueness_score?: number | null
          vo_script?: string | null
          vo_script_variants?: Json
          vo_url?: string | null
          voice_id?: string
          voice_style?: string | null
          voiceover_error?: Json | null
          voiceover_last_attempt_at?: string | null
          voiceover_script?: Json | null
          voiceover_url?: string | null
          voiceover_voice_id?: string | null
          worker_last_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cinematic_ad_jobs_pinterest_asset_id_fkey"
            columns: ["pinterest_asset_id"]
            isOneToOne: false
            referencedRelation: "pinterest_video_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cinematic_ad_jobs_pinterest_asset_id_fkey"
            columns: ["pinterest_asset_id"]
            isOneToOne: false
            referencedRelation: "pinterest_video_winners"
            referencedColumns: ["asset_id"]
          },
        ]
      }
      cinematic_ad_publish_queue: {
        Row: {
          asset_id: string | null
          attempt_count: number
          created_at: string
          id: string
          job_id: string
          last_attempt_at: string | null
          last_error: string | null
          max_attempts: number
          metadata: Json
          next_attempt_at: string
          pin_id: string | null
          pin_url: string | null
          pinterest_video_queue_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          attempt_count?: number
          created_at?: string
          id?: string
          job_id: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number
          metadata?: Json
          next_attempt_at?: string
          pin_id?: string | null
          pin_url?: string | null
          pinterest_video_queue_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          attempt_count?: number
          created_at?: string
          id?: string
          job_id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number
          metadata?: Json
          next_attempt_at?: string
          pin_id?: string | null
          pin_url?: string | null
          pinterest_video_queue_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cinematic_ad_publish_queue_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "pinterest_video_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cinematic_ad_publish_queue_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "pinterest_video_winners"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "cinematic_ad_publish_queue_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cinematic_ad_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cinematic_ad_publish_queue_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cinematic_ad_pipeline_tracking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cinematic_ad_publish_queue_pinterest_video_queue_id_fkey"
            columns: ["pinterest_video_queue_id"]
            isOneToOne: false
            referencedRelation: "pinterest_video_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      cinematic_ad_settings: {
        Row: {
          allow_static_fallback: boolean
          allowed_creative_categories: Json
          approval_confidence_threshold: number
          auto_approve_enabled: boolean
          auto_publish_enabled: boolean | null
          auto_repair_threshold: number | null
          ban_showroom: boolean
          blocked_creative_styles: Json
          board_max_pins_per_window: number
          board_recent_window_minutes: number
          camera_styles: Json
          category_match_required: boolean
          cinematic_v4_enabled: boolean
          cinematic_v5_enabled: boolean
          creative_quality_min_score: number
          engine_version: string | null
          engine_version_default: string
          environment_realism_min: number
          exposure_drift_amp: number
          focus_breathing_amp: number
          framing_correction_chance: number
          handheld_jitter_amp: number
          hook_change_max_frames: number
          hook_cooldown_days: number
          human_presence_required_ratio: number
          human_realism_min: number
          human_realism_required: boolean
          id: boolean
          max_duplicate_threshold: number
          max_pins_per_day: number
          max_render_attempts: number | null
          max_retry_threshold: number
          max_scenes: number | null
          max_static_duration_frames_v5: number
          min_camera_motion_score: number
          min_caption_visibility: number | null
          min_days_between_same_product: number
          min_emotional_arc: number
          min_engagement_pacing_score: number
          min_first_frame_originality_score: number
          min_hook_uniqueness_score: number
          min_motion_diversity: number | null
          min_motion_entropy: number
          min_publish_gap_minutes: number
          min_realism_consistency: number
          min_realism_score: number
          min_scene_count_v4: number
          min_scene_diversity: number | null
          min_scenes: number | null
          min_thumb_stop_score: number
          min_thumbnail_entropy_score: number
          min_ugc_authenticity: number
          min_unique_media_assets: number
          min_visual_uniqueness_score: number
          motion_score_min_threshold: number
          pattern_interrupt_every_max_frames: number
          pattern_interrupt_every_min_frames: number
          pinterest_publish_max_per_day: number
          pinterest_publish_max_per_hour: number
          pinterest_publish_min_slug_gap_minutes: number
          pinterest_publish_premium_cap_per_hour: number
          pinterest_publish_quality_floor: number | null
          pinterest_publish_recovery_mode: boolean
          publish_jitter_max_seconds: number
          publish_jitter_min_seconds: number
          publish_windows_est: Json
          qa_preview_required: boolean
          recovery_auto_exit_days: number
          recovery_tier_progression: Json
          reject_aggressive_cta: boolean
          reject_orange_title_bar: boolean
          reject_white_background: boolean
          required_beats_v5: string[]
          required_scene_roles: Json
          safe_zone_debug: boolean | null
          scene_change_min_v5: number
          scene_max_frames_v4: number
          scene_max_frames_v5: number
          scene_min_frames_v4: number
          scene_min_frames_v5: number
          static_hold_max_frames: number
          static_share_cap: number
          style_bias_epsilon: number
          style_suppression_days: number
          text_safe_area_required: boolean
          thumbnail_phash_distance_threshold: number
          updated_at: string
          updated_by: string | null
          v5_reject_rate_rollback_threshold: number
          video_share_floor: number
          voiceover_required: boolean
          worker_health_url: string | null
        }
        Insert: {
          allow_static_fallback?: boolean
          allowed_creative_categories?: Json
          approval_confidence_threshold?: number
          auto_approve_enabled?: boolean
          auto_publish_enabled?: boolean | null
          auto_repair_threshold?: number | null
          ban_showroom?: boolean
          blocked_creative_styles?: Json
          board_max_pins_per_window?: number
          board_recent_window_minutes?: number
          camera_styles?: Json
          category_match_required?: boolean
          cinematic_v4_enabled?: boolean
          cinematic_v5_enabled?: boolean
          creative_quality_min_score?: number
          engine_version?: string | null
          engine_version_default?: string
          environment_realism_min?: number
          exposure_drift_amp?: number
          focus_breathing_amp?: number
          framing_correction_chance?: number
          handheld_jitter_amp?: number
          hook_change_max_frames?: number
          hook_cooldown_days?: number
          human_presence_required_ratio?: number
          human_realism_min?: number
          human_realism_required?: boolean
          id?: boolean
          max_duplicate_threshold?: number
          max_pins_per_day?: number
          max_render_attempts?: number | null
          max_retry_threshold?: number
          max_scenes?: number | null
          max_static_duration_frames_v5?: number
          min_camera_motion_score?: number
          min_caption_visibility?: number | null
          min_days_between_same_product?: number
          min_emotional_arc?: number
          min_engagement_pacing_score?: number
          min_first_frame_originality_score?: number
          min_hook_uniqueness_score?: number
          min_motion_diversity?: number | null
          min_motion_entropy?: number
          min_publish_gap_minutes?: number
          min_realism_consistency?: number
          min_realism_score?: number
          min_scene_count_v4?: number
          min_scene_diversity?: number | null
          min_scenes?: number | null
          min_thumb_stop_score?: number
          min_thumbnail_entropy_score?: number
          min_ugc_authenticity?: number
          min_unique_media_assets?: number
          min_visual_uniqueness_score?: number
          motion_score_min_threshold?: number
          pattern_interrupt_every_max_frames?: number
          pattern_interrupt_every_min_frames?: number
          pinterest_publish_max_per_day?: number
          pinterest_publish_max_per_hour?: number
          pinterest_publish_min_slug_gap_minutes?: number
          pinterest_publish_premium_cap_per_hour?: number
          pinterest_publish_quality_floor?: number | null
          pinterest_publish_recovery_mode?: boolean
          publish_jitter_max_seconds?: number
          publish_jitter_min_seconds?: number
          publish_windows_est?: Json
          qa_preview_required?: boolean
          recovery_auto_exit_days?: number
          recovery_tier_progression?: Json
          reject_aggressive_cta?: boolean
          reject_orange_title_bar?: boolean
          reject_white_background?: boolean
          required_beats_v5?: string[]
          required_scene_roles?: Json
          safe_zone_debug?: boolean | null
          scene_change_min_v5?: number
          scene_max_frames_v4?: number
          scene_max_frames_v5?: number
          scene_min_frames_v4?: number
          scene_min_frames_v5?: number
          static_hold_max_frames?: number
          static_share_cap?: number
          style_bias_epsilon?: number
          style_suppression_days?: number
          text_safe_area_required?: boolean
          thumbnail_phash_distance_threshold?: number
          updated_at?: string
          updated_by?: string | null
          v5_reject_rate_rollback_threshold?: number
          video_share_floor?: number
          voiceover_required?: boolean
          worker_health_url?: string | null
        }
        Update: {
          allow_static_fallback?: boolean
          allowed_creative_categories?: Json
          approval_confidence_threshold?: number
          auto_approve_enabled?: boolean
          auto_publish_enabled?: boolean | null
          auto_repair_threshold?: number | null
          ban_showroom?: boolean
          blocked_creative_styles?: Json
          board_max_pins_per_window?: number
          board_recent_window_minutes?: number
          camera_styles?: Json
          category_match_required?: boolean
          cinematic_v4_enabled?: boolean
          cinematic_v5_enabled?: boolean
          creative_quality_min_score?: number
          engine_version?: string | null
          engine_version_default?: string
          environment_realism_min?: number
          exposure_drift_amp?: number
          focus_breathing_amp?: number
          framing_correction_chance?: number
          handheld_jitter_amp?: number
          hook_change_max_frames?: number
          hook_cooldown_days?: number
          human_presence_required_ratio?: number
          human_realism_min?: number
          human_realism_required?: boolean
          id?: boolean
          max_duplicate_threshold?: number
          max_pins_per_day?: number
          max_render_attempts?: number | null
          max_retry_threshold?: number
          max_scenes?: number | null
          max_static_duration_frames_v5?: number
          min_camera_motion_score?: number
          min_caption_visibility?: number | null
          min_days_between_same_product?: number
          min_emotional_arc?: number
          min_engagement_pacing_score?: number
          min_first_frame_originality_score?: number
          min_hook_uniqueness_score?: number
          min_motion_diversity?: number | null
          min_motion_entropy?: number
          min_publish_gap_minutes?: number
          min_realism_consistency?: number
          min_realism_score?: number
          min_scene_count_v4?: number
          min_scene_diversity?: number | null
          min_scenes?: number | null
          min_thumb_stop_score?: number
          min_thumbnail_entropy_score?: number
          min_ugc_authenticity?: number
          min_unique_media_assets?: number
          min_visual_uniqueness_score?: number
          motion_score_min_threshold?: number
          pattern_interrupt_every_max_frames?: number
          pattern_interrupt_every_min_frames?: number
          pinterest_publish_max_per_day?: number
          pinterest_publish_max_per_hour?: number
          pinterest_publish_min_slug_gap_minutes?: number
          pinterest_publish_premium_cap_per_hour?: number
          pinterest_publish_quality_floor?: number | null
          pinterest_publish_recovery_mode?: boolean
          publish_jitter_max_seconds?: number
          publish_jitter_min_seconds?: number
          publish_windows_est?: Json
          qa_preview_required?: boolean
          recovery_auto_exit_days?: number
          recovery_tier_progression?: Json
          reject_aggressive_cta?: boolean
          reject_orange_title_bar?: boolean
          reject_white_background?: boolean
          required_beats_v5?: string[]
          required_scene_roles?: Json
          safe_zone_debug?: boolean | null
          scene_change_min_v5?: number
          scene_max_frames_v4?: number
          scene_max_frames_v5?: number
          scene_min_frames_v4?: number
          scene_min_frames_v5?: number
          static_hold_max_frames?: number
          static_share_cap?: number
          style_bias_epsilon?: number
          style_suppression_days?: number
          text_safe_area_required?: boolean
          thumbnail_phash_distance_threshold?: number
          updated_at?: string
          updated_by?: string | null
          v5_reject_rate_rollback_threshold?: number
          video_share_floor?: number
          voiceover_required?: boolean
          worker_health_url?: string | null
        }
        Relationships: []
      }
      cinematic_ad_style_presets: {
        Row: {
          active: boolean
          caption_config: Json
          created_at: string
          display_name: string
          id: string
          motion_config: Json
          pacing_config: Json
          preset_name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          caption_config?: Json
          created_at?: string
          display_name: string
          id?: string
          motion_config?: Json
          pacing_config?: Json
          preset_name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          caption_config?: Json
          created_at?: string
          display_name?: string
          id?: string
          motion_config?: Json
          pacing_config?: Json
          preset_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      cinematic_autopilot_state: {
        Row: {
          hard_stop_reasons: string[]
          id: number
          last_watchdog_result: Json
          last_watchdog_run_at: string | null
          paused: boolean
          paused_at: string | null
          paused_by: string | null
          paused_reason: string | null
          updated_at: string
        }
        Insert: {
          hard_stop_reasons?: string[]
          id?: number
          last_watchdog_result?: Json
          last_watchdog_run_at?: string | null
          paused?: boolean
          paused_at?: string | null
          paused_by?: string | null
          paused_reason?: string | null
          updated_at?: string
        }
        Update: {
          hard_stop_reasons?: string[]
          id?: number
          last_watchdog_result?: Json
          last_watchdog_run_at?: string | null
          paused?: boolean
          paused_at?: string | null
          paused_by?: string | null
          paused_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cinematic_creative_dna: {
        Row: {
          created_at: string
          dna_fingerprint: string
          hook_type: string | null
          id: string
          last_used_at: string | null
          motion_sequence: Json
          performance: Json
          sample_count: number
          scene_sequence: Json
          score: number
          style_preset: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dna_fingerprint: string
          hook_type?: string | null
          id?: string
          last_used_at?: string | null
          motion_sequence?: Json
          performance?: Json
          sample_count?: number
          scene_sequence?: Json
          score?: number
          style_preset?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dna_fingerprint?: string
          hook_type?: string | null
          id?: string
          last_used_at?: string | null
          motion_sequence?: Json
          performance?: Json
          sample_count?: number
          scene_sequence?: Json
          score?: number
          style_preset?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cinematic_hook_variants: {
        Row: {
          archived: boolean
          created_at: string
          emotional_register: string | null
          hook_text: string
          hook_type: string
          id: string
          last_used_at: string | null
          predicted_ctr: number | null
          predicted_ctr_rationale: string | null
          product_category: string | null
          product_slug: string
          updated_at: string
          uses: number
        }
        Insert: {
          archived?: boolean
          created_at?: string
          emotional_register?: string | null
          hook_text: string
          hook_type: string
          id?: string
          last_used_at?: string | null
          predicted_ctr?: number | null
          predicted_ctr_rationale?: string | null
          product_category?: string | null
          product_slug: string
          updated_at?: string
          uses?: number
        }
        Update: {
          archived?: boolean
          created_at?: string
          emotional_register?: string | null
          hook_text?: string
          hook_type?: string
          id?: string
          last_used_at?: string | null
          predicted_ctr?: number | null
          predicted_ctr_rationale?: string | null
          product_category?: string | null
          product_slug?: string
          updated_at?: string
          uses?: number
        }
        Relationships: []
      }
      cinematic_humanization_pools: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          pool_type: string
          updated_at: string
          variants: Json
          weights: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          pool_type: string
          updated_at?: string
          variants: Json
          weights?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          pool_type?: string
          updated_at?: string
          variants?: Json
          weights?: Json | null
        }
        Relationships: []
      }
      cinematic_music_tracks: {
        Row: {
          active: boolean
          bpm: number | null
          created_at: string
          duration_seconds: number | null
          id: string
          license: string
          mood: string
          url: string
          weight: number
        }
        Insert: {
          active?: boolean
          bpm?: number | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          license?: string
          mood: string
          url: string
          weight?: number
        }
        Update: {
          active?: boolean
          bpm?: number | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          license?: string
          mood?: string
          url?: string
          weight?: number
        }
        Relationships: []
      }
      cinematic_performance_signals: {
        Row: {
          add_to_cart_rate: number | null
          completion_rate: number | null
          composite_score: number | null
          created_at: string
          hold_rate: number | null
          id: string
          job_id: string | null
          outbound_ctr: number | null
          pin_id: string | null
          save_rate: number | null
          updated_at: string
          window_days: number | null
        }
        Insert: {
          add_to_cart_rate?: number | null
          completion_rate?: number | null
          composite_score?: number | null
          created_at?: string
          hold_rate?: number | null
          id?: string
          job_id?: string | null
          outbound_ctr?: number | null
          pin_id?: string | null
          save_rate?: number | null
          updated_at?: string
          window_days?: number | null
        }
        Update: {
          add_to_cart_rate?: number | null
          completion_rate?: number | null
          composite_score?: number | null
          created_at?: string
          hold_rate?: number | null
          id?: string
          job_id?: string | null
          outbound_ctr?: number | null
          pin_id?: string | null
          save_rate?: number | null
          updated_at?: string
          window_days?: number | null
        }
        Relationships: []
      }
      cinematic_pin_performance: {
        Row: {
          asset_id: string | null
          board_id: string | null
          collected_at: string
          created_at: string
          engagement_rate: number | null
          hook_archetype: string | null
          id: string
          impressions: number
          job_id: string | null
          outbound_clicks: number
          pin_id: string
          saves: number
          watch_seconds_p50: number | null
        }
        Insert: {
          asset_id?: string | null
          board_id?: string | null
          collected_at?: string
          created_at?: string
          engagement_rate?: number | null
          hook_archetype?: string | null
          id?: string
          impressions?: number
          job_id?: string | null
          outbound_clicks?: number
          pin_id: string
          saves?: number
          watch_seconds_p50?: number | null
        }
        Update: {
          asset_id?: string | null
          board_id?: string | null
          collected_at?: string
          created_at?: string
          engagement_rate?: number | null
          hook_archetype?: string | null
          id?: string
          impressions?: number
          job_id?: string | null
          outbound_clicks?: number
          pin_id?: string
          saves?: number
          watch_seconds_p50?: number | null
        }
        Relationships: []
      }
      cinematic_quarantine_patterns: {
        Row: {
          created_at: string
          id: string
          pattern_type: string
          pattern_value: string
          quarantined_until: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          pattern_type: string
          pattern_value: string
          quarantined_until?: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          pattern_type?: string
          pattern_value?: string
          quarantined_until?: string
          reason?: string | null
        }
        Relationships: []
      }
      cinematic_style_bias: {
        Row: {
          beat_signature: string | null
          camera_style: string | null
          composite: number
          hook_type: string | null
          id: string
          niche: string
          sample_size: number
          suppressed_until: string | null
          updated_at: string
          weight: number
        }
        Insert: {
          beat_signature?: string | null
          camera_style?: string | null
          composite?: number
          hook_type?: string | null
          id?: string
          niche: string
          sample_size?: number
          suppressed_until?: string | null
          updated_at?: string
          weight?: number
        }
        Update: {
          beat_signature?: string | null
          camera_style?: string | null
          composite?: number
          hook_type?: string | null
          id?: string
          niche?: string
          sample_size?: number
          suppressed_until?: string | null
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      cinematic_style_weights: {
        Row: {
          avg_completion: number | null
          avg_ctr: number | null
          avg_hold_rate: number | null
          avg_save_rate: number | null
          composite_score: number | null
          computed_at: string
          hook_type: string | null
          id: string
          niche_key: string | null
          sample_size: number
          style_preset_key: string
          suppressed_until: string | null
          weight: number
        }
        Insert: {
          avg_completion?: number | null
          avg_ctr?: number | null
          avg_hold_rate?: number | null
          avg_save_rate?: number | null
          composite_score?: number | null
          computed_at?: string
          hook_type?: string | null
          id?: string
          niche_key?: string | null
          sample_size?: number
          style_preset_key: string
          suppressed_until?: string | null
          weight?: number
        }
        Update: {
          avg_completion?: number | null
          avg_ctr?: number | null
          avg_hold_rate?: number | null
          avg_save_rate?: number | null
          composite_score?: number | null
          computed_at?: string
          hook_type?: string | null
          id?: string
          niche_key?: string | null
          sample_size?: number
          style_preset_key?: string
          suppressed_until?: string | null
          weight?: number
        }
        Relationships: []
      }
      cinematic_voice_profiles: {
        Row: {
          active: boolean
          created_at: string
          gender: string
          id: string
          label: string
          tone: string
          voice_id: string
          weight: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          gender: string
          id?: string
          label: string
          tone: string
          voice_id: string
          weight?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          gender?: string
          id?: string
          label?: string
          tone?: string
          voice_id?: string
          weight?: number
        }
        Relationships: []
      }
      cinematic_voiceover_alert_log: {
        Row: {
          consecutive_failures: number
          created_at: string
          email_error: string | null
          email_sent: boolean
          id: string
          key_fingerprint: string
          payload: Json | null
          source_function: string
          webhook_error: string | null
          webhook_sent: boolean
          webhook_status: number | null
        }
        Insert: {
          consecutive_failures: number
          created_at?: string
          email_error?: string | null
          email_sent?: boolean
          id?: string
          key_fingerprint: string
          payload?: Json | null
          source_function: string
          webhook_error?: string | null
          webhook_sent?: boolean
          webhook_status?: number | null
        }
        Update: {
          consecutive_failures?: number
          created_at?: string
          email_error?: string | null
          email_sent?: boolean
          id?: string
          key_fingerprint?: string
          payload?: Json | null
          source_function?: string
          webhook_error?: string | null
          webhook_sent?: boolean
          webhook_status?: number | null
        }
        Relationships: []
      }
      cinematic_voiceover_alert_settings: {
        Row: {
          cooldown_minutes: number
          enabled: boolean
          id: number
          recipient_email: string | null
          threshold: number
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          cooldown_minutes?: number
          enabled?: boolean
          id?: number
          recipient_email?: string | null
          threshold?: number
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          cooldown_minutes?: number
          enabled?: boolean
          id?: number
          recipient_email?: string | null
          threshold?: number
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      cinematic_voiceover_key_state: {
        Row: {
          alert_count: number
          alert_sent_at: string | null
          consecutive_failures: number
          id: boolean
          key_fingerprint: string | null
          last_checked_at: string
          last_error: string | null
          state: string
          updated_at: string
        }
        Insert: {
          alert_count?: number
          alert_sent_at?: string | null
          consecutive_failures?: number
          id?: boolean
          key_fingerprint?: string | null
          last_checked_at?: string
          last_error?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          alert_count?: number
          alert_sent_at?: string | null
          consecutive_failures?: number
          id?: boolean
          key_fingerprint?: string | null
          last_checked_at?: string
          last_error?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      cinematic_voiceover_lines: {
        Row: {
          active: boolean
          archetype: string
          beat: string
          created_at: string
          id: string
          text: string
          weight: number
        }
        Insert: {
          active?: boolean
          archetype: string
          beat: string
          created_at?: string
          id?: string
          text: string
          weight?: number
        }
        Update: {
          active?: boolean
          archetype?: string
          beat?: string
          created_at?: string
          id?: string
          text?: string
          weight?: number
        }
        Relationships: []
      }
      cinematic_worker_heartbeats: {
        Row: {
          last_claim_at: string | null
          last_job_id: string | null
          last_poll_at: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          last_claim_at?: string | null
          last_job_id?: string | null
          last_poll_at?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          last_claim_at?: string | null
          last_job_id?: string | null
          last_poll_at?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: []
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
      cohort_copy_pin_history: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          hook_family: string
          id: number
          mode: string
          placement: string
          reason: string | null
          winning_label: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          hook_family: string
          id?: number
          mode: string
          placement: string
          reason?: string | null
          winning_label?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          hook_family?: string
          id?: number
          mode?: string
          placement?: string
          reason?: string | null
          winning_label?: string | null
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
      cta_copy_winners: {
        Row: {
          clicks: number
          ctr_pct: number | null
          evaluated_at: string
          id: number
          impressions: number
          mode: string
          notes: string | null
          placement: string
          window_hours: number
          winning_label: string
        }
        Insert: {
          clicks?: number
          ctr_pct?: number | null
          evaluated_at?: string
          id?: number
          impressions?: number
          mode: string
          notes?: string | null
          placement: string
          window_hours?: number
          winning_label: string
        }
        Update: {
          clicks?: number
          ctr_pct?: number | null
          evaluated_at?: string
          id?: number
          impressions?: number
          mode?: string
          notes?: string | null
          placement?: string
          window_hours?: number
          winning_label?: string
        }
        Relationships: []
      }
      cta_copy_winners_by_hook: {
        Row: {
          clicks: number
          confidence_score: number | null
          ctr_pct: number | null
          evaluated_at: string
          guardrail_blocked: boolean
          guardrail_evaluated_at: string | null
          guardrail_reason: string | null
          hook_family: string
          id: number
          impressions: number
          mode: string
          notes: string | null
          pinned: boolean
          pinned_at: string | null
          pinned_by: string | null
          placement: string
          window_hours: number
          winning_label: string
        }
        Insert: {
          clicks?: number
          confidence_score?: number | null
          ctr_pct?: number | null
          evaluated_at?: string
          guardrail_blocked?: boolean
          guardrail_evaluated_at?: string | null
          guardrail_reason?: string | null
          hook_family: string
          id?: number
          impressions?: number
          mode: string
          notes?: string | null
          pinned?: boolean
          pinned_at?: string | null
          pinned_by?: string | null
          placement: string
          window_hours?: number
          winning_label: string
        }
        Update: {
          clicks?: number
          confidence_score?: number | null
          ctr_pct?: number | null
          evaluated_at?: string
          guardrail_blocked?: boolean
          guardrail_evaluated_at?: string | null
          guardrail_reason?: string | null
          hook_family?: string
          id?: number
          impressions?: number
          mode?: string
          notes?: string | null
          pinned?: boolean
          pinned_at?: string | null
          pinned_by?: string | null
          placement?: string
          window_hours?: number
          winning_label?: string
        }
        Relationships: []
      }
      cta_variant_config: {
        Row: {
          ab_test_enabled: boolean
          ab_test_split_a_pct: number
          ab_test_started_at: string | null
          ab_test_variant_a: string | null
          ab_test_variant_b: string | null
          active_variant: string
          baseline_variant: string
          ctr_floor_pct: number
          evaluation_window_hours: number
          id: number
          min_impressions: number
          rollback_enabled: boolean
          updated_at: string
        }
        Insert: {
          ab_test_enabled?: boolean
          ab_test_split_a_pct?: number
          ab_test_started_at?: string | null
          ab_test_variant_a?: string | null
          ab_test_variant_b?: string | null
          active_variant?: string
          baseline_variant?: string
          ctr_floor_pct?: number
          evaluation_window_hours?: number
          id: number
          min_impressions?: number
          rollback_enabled?: boolean
          updated_at?: string
        }
        Update: {
          ab_test_enabled?: boolean
          ab_test_split_a_pct?: number
          ab_test_started_at?: string | null
          ab_test_variant_a?: string | null
          ab_test_variant_b?: string | null
          active_variant?: string
          baseline_variant?: string
          ctr_floor_pct?: number
          evaluation_window_hours?: number
          id?: number
          min_impressions?: number
          rollback_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      cta_variant_rollback_log: {
        Row: {
          clicks: number | null
          created_at: string
          ctr_floor_pct: number | null
          ctr_pct: number | null
          from_variant: string
          id: string
          impressions: number | null
          reason: string
          to_variant: string
          was_automatic: boolean
          window_hours: number | null
        }
        Insert: {
          clicks?: number | null
          created_at?: string
          ctr_floor_pct?: number | null
          ctr_pct?: number | null
          from_variant: string
          id?: string
          impressions?: number | null
          reason: string
          to_variant: string
          was_automatic?: boolean
          window_hours?: number | null
        }
        Update: {
          clicks?: number | null
          created_at?: string
          ctr_floor_pct?: number | null
          ctr_pct?: number | null
          from_variant?: string
          id?: string
          impressions?: number | null
          reason?: string
          to_variant?: string
          was_automatic?: boolean
          window_hours?: number | null
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
      funnel_qa_runs: {
        Row: {
          id: string
          notes: string | null
          run_at: string
          run_by: string | null
          status: string
          steps: Json
        }
        Insert: {
          id?: string
          notes?: string | null
          run_at?: string
          run_by?: string | null
          status: string
          steps?: Json
        }
        Update: {
          id?: string
          notes?: string | null
          run_at?: string
          run_by?: string | null
          status?: string
          steps?: Json
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
      gi_attribution_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          meta: Json | null
          occurred_at: string
          page_path: string | null
          product_id: string | null
          product_slug: string | null
          quantity: number | null
          revenue_cents: number | null
          session_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          meta?: Json | null
          occurred_at: string
          page_path?: string | null
          product_id?: string | null
          product_slug?: string | null
          quantity?: number | null
          revenue_cents?: number | null
          session_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          meta?: Json | null
          occurred_at?: string
          page_path?: string | null
          product_id?: string | null
          product_slug?: string | null
          quantity?: number | null
          revenue_cents?: number | null
          session_id?: string
        }
        Relationships: []
      }
      gi_automation_actions: {
        Row: {
          acted_at: string
          action: string
          autopilot_mode: string
          error: string | null
          id: string
          result: Json | null
          status: string
          target_id: string | null
          target_kind: string | null
        }
        Insert: {
          acted_at?: string
          action: string
          autopilot_mode: string
          error?: string | null
          id?: string
          result?: Json | null
          status: string
          target_id?: string | null
          target_kind?: string | null
        }
        Update: {
          acted_at?: string
          action?: string
          autopilot_mode?: string
          error?: string | null
          id?: string
          result?: Json | null
          status?: string
          target_id?: string | null
          target_kind?: string | null
        }
        Relationships: []
      }
      gi_channel_performance_daily: {
        Row: {
          add_to_cart: number | null
          channel: string
          created_at: string
          date: string
          id: string
          purchases: number | null
          revenue_cents: number | null
          sessions_excluded: number | null
          sessions_us: number | null
        }
        Insert: {
          add_to_cart?: number | null
          channel: string
          created_at?: string
          date: string
          id?: string
          purchases?: number | null
          revenue_cents?: number | null
          sessions_excluded?: number | null
          sessions_us?: number | null
        }
        Update: {
          add_to_cart?: number | null
          channel?: string
          created_at?: string
          date?: string
          id?: string
          purchases?: number | null
          revenue_cents?: number | null
          sessions_excluded?: number | null
          sessions_us?: number | null
        }
        Relationships: []
      }
      gi_compliance_review_log: {
        Row: {
          id: string
          outcome: string
          payload: Json | null
          reasons: string[] | null
          reviewed_at: string
          suggested_rewrite: string | null
          target_id: string | null
          target_kind: string
        }
        Insert: {
          id?: string
          outcome: string
          payload?: Json | null
          reasons?: string[] | null
          reviewed_at?: string
          suggested_rewrite?: string | null
          target_id?: string | null
          target_kind: string
        }
        Update: {
          id?: string
          outcome?: string
          payload?: Json | null
          reasons?: string[] | null
          reviewed_at?: string
          suggested_rewrite?: string | null
          target_id?: string | null
          target_kind?: string
        }
        Relationships: []
      }
      gi_creative_performance_daily: {
        Row: {
          add_to_cart: number | null
          channel: string | null
          clicks: number | null
          content_item_id: string | null
          created_at: string
          date: string
          id: string
          impressions: number | null
          outbound_clicks: number | null
          purchases: number | null
          revenue_cents: number | null
          saves: number | null
          sessions_us: number | null
        }
        Insert: {
          add_to_cart?: number | null
          channel?: string | null
          clicks?: number | null
          content_item_id?: string | null
          created_at?: string
          date: string
          id?: string
          impressions?: number | null
          outbound_clicks?: number | null
          purchases?: number | null
          revenue_cents?: number | null
          saves?: number | null
          sessions_us?: number | null
        }
        Update: {
          add_to_cart?: number | null
          channel?: string | null
          clicks?: number | null
          content_item_id?: string | null
          created_at?: string
          date?: string
          id?: string
          impressions?: number | null
          outbound_clicks?: number | null
          purchases?: number | null
          revenue_cents?: number | null
          saves?: number | null
          sessions_us?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gi_creative_performance_daily_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "gi_social_content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      gi_ga4_events: {
        Row: {
          campaign: string | null
          conversions: number | null
          country: string | null
          created_at: string
          date: string
          device: string | null
          event_count: number | null
          event_name: string | null
          id: string
          medium: string | null
          page_path: string | null
          raw: Json | null
          revenue_cents: number | null
          sessions: number | null
          source: string | null
        }
        Insert: {
          campaign?: string | null
          conversions?: number | null
          country?: string | null
          created_at?: string
          date: string
          device?: string | null
          event_count?: number | null
          event_name?: string | null
          id?: string
          medium?: string | null
          page_path?: string | null
          raw?: Json | null
          revenue_cents?: number | null
          sessions?: number | null
          source?: string | null
        }
        Update: {
          campaign?: string | null
          conversions?: number | null
          country?: string | null
          created_at?: string
          date?: string
          device?: string | null
          event_count?: number | null
          event_name?: string | null
          id?: string
          medium?: string | null
          page_path?: string | null
          raw?: Json | null
          revenue_cents?: number | null
          sessions?: number | null
          source?: string | null
        }
        Relationships: []
      }
      gi_growth_decisions: {
        Row: {
          confidence: number | null
          decided_at: string
          decision_type: string
          id: string
          rationale: string | null
          score: number | null
          signals: Json | null
          status: string
          target_id: string
          target_kind: string
        }
        Insert: {
          confidence?: number | null
          decided_at?: string
          decision_type: string
          id?: string
          rationale?: string | null
          score?: number | null
          signals?: Json | null
          status?: string
          target_id: string
          target_kind: string
        }
        Update: {
          confidence?: number | null
          decided_at?: string
          decision_type?: string
          id?: string
          rationale?: string | null
          score?: number | null
          signals?: Json | null
          status?: string
          target_id?: string
          target_kind?: string
        }
        Relationships: []
      }
      gi_gsc_metrics: {
        Row: {
          clicks: number | null
          country: string | null
          created_at: string
          ctr: number | null
          date: string
          id: string
          impressions: number | null
          page: string | null
          position: number | null
          query: string | null
          raw: Json | null
        }
        Insert: {
          clicks?: number | null
          country?: string | null
          created_at?: string
          ctr?: number | null
          date: string
          id?: string
          impressions?: number | null
          page?: string | null
          position?: number | null
          query?: string | null
          raw?: Json | null
        }
        Update: {
          clicks?: number | null
          country?: string | null
          created_at?: string
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number | null
          page?: string | null
          position?: number | null
          query?: string | null
          raw?: Json | null
        }
        Relationships: []
      }
      gi_pinterest_pin_metrics: {
        Row: {
          created_at: string
          ctr: number | null
          date: string
          id: string
          impressions: number | null
          outbound_clicks: number | null
          pin_clicks: number | null
          pin_id: string
          raw: Json | null
          saves: number | null
        }
        Insert: {
          created_at?: string
          ctr?: number | null
          date: string
          id?: string
          impressions?: number | null
          outbound_clicks?: number | null
          pin_clicks?: number | null
          pin_id: string
          raw?: Json | null
          saves?: number | null
        }
        Update: {
          created_at?: string
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number | null
          outbound_clicks?: number | null
          pin_clicks?: number | null
          pin_id?: string
          raw?: Json | null
          saves?: number | null
        }
        Relationships: []
      }
      gi_product_performance_daily: {
        Row: {
          add_to_cart: number | null
          checkouts: number | null
          created_at: string
          date: string
          id: string
          product_id: string | null
          product_slug: string | null
          purchases: number | null
          revenue_cents: number | null
          sessions_us: number | null
          views: number | null
        }
        Insert: {
          add_to_cart?: number | null
          checkouts?: number | null
          created_at?: string
          date: string
          id?: string
          product_id?: string | null
          product_slug?: string | null
          purchases?: number | null
          revenue_cents?: number | null
          sessions_us?: number | null
          views?: number | null
        }
        Update: {
          add_to_cart?: number | null
          checkouts?: number | null
          created_at?: string
          date?: string
          id?: string
          product_id?: string | null
          product_slug?: string | null
          purchases?: number | null
          revenue_cents?: number | null
          sessions_us?: number | null
          views?: number | null
        }
        Relationships: []
      }
      gi_settings: {
        Row: {
          autopilot_mode: string
          country_allowlist: string[]
          created_at: string
          id: string
          market: string
          min_us_sessions_for_decisions: number
          notes: string | null
          pinterest_daily_cap: number
          singleton: boolean
          tiktok_daily_cap: number
          updated_at: string
        }
        Insert: {
          autopilot_mode?: string
          country_allowlist?: string[]
          created_at?: string
          id?: string
          market?: string
          min_us_sessions_for_decisions?: number
          notes?: string | null
          pinterest_daily_cap?: number
          singleton?: boolean
          tiktok_daily_cap?: number
          updated_at?: string
        }
        Update: {
          autopilot_mode?: string
          country_allowlist?: string[]
          created_at?: string
          id?: string
          market?: string
          min_us_sessions_for_decisions?: number
          notes?: string | null
          pinterest_daily_cap?: number
          singleton?: boolean
          tiktok_daily_cap?: number
          updated_at?: string
        }
        Relationships: []
      }
      gi_social_content_items: {
        Row: {
          asset_url: string | null
          channel: string
          created_at: string
          description: string | null
          destination_url: string | null
          external_id: string | null
          fingerprint: string | null
          hook_family: string | null
          id: string
          meta: Json | null
          product_slug: string | null
          published_at: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          asset_url?: string | null
          channel: string
          created_at?: string
          description?: string | null
          destination_url?: string | null
          external_id?: string | null
          fingerprint?: string | null
          hook_family?: string | null
          id?: string
          meta?: Json | null
          product_slug?: string | null
          published_at?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          asset_url?: string | null
          channel?: string
          created_at?: string
          description?: string | null
          destination_url?: string | null
          external_id?: string | null
          fingerprint?: string | null
          hook_family?: string | null
          id?: string
          meta?: Json | null
          product_slug?: string | null
          published_at?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      gi_tiktok_video_metrics: {
        Row: {
          avg_watch_seconds: number | null
          comments: number | null
          completion_rate: number | null
          created_at: string
          date: string
          id: string
          likes: number | null
          profile_clicks: number | null
          raw: Json | null
          shares: number | null
          video_id: string
          views: number | null
        }
        Insert: {
          avg_watch_seconds?: number | null
          comments?: number | null
          completion_rate?: number | null
          created_at?: string
          date: string
          id?: string
          likes?: number | null
          profile_clicks?: number | null
          raw?: Json | null
          shares?: number | null
          video_id: string
          views?: number | null
        }
        Update: {
          avg_watch_seconds?: number | null
          comments?: number | null
          completion_rate?: number | null
          created_at?: string
          date?: string
          id?: string
          likes?: number | null
          profile_clicks?: number | null
          raw?: Json | null
          shares?: number | null
          video_id?: string
          views?: number | null
        }
        Relationships: []
      }
      gi_traffic_sessions: {
        Row: {
          browser: string | null
          campaign: string | null
          city: string | null
          content: string | null
          country: string | null
          created_at: string
          device: string | null
          id: string
          is_bot: boolean
          is_internal: boolean
          is_us: boolean
          landing_page: string | null
          medium: string | null
          pin_id: string | null
          raw: Json | null
          region: string | null
          session_id: string
          source: string | null
          started_at: string
          term: string | null
          video_id: string | null
          visitor_id: string | null
        }
        Insert: {
          browser?: string | null
          campaign?: string | null
          city?: string | null
          content?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          id?: string
          is_bot?: boolean
          is_internal?: boolean
          is_us?: boolean
          landing_page?: string | null
          medium?: string | null
          pin_id?: string | null
          raw?: Json | null
          region?: string | null
          session_id: string
          source?: string | null
          started_at: string
          term?: string | null
          video_id?: string | null
          visitor_id?: string | null
        }
        Update: {
          browser?: string | null
          campaign?: string | null
          city?: string | null
          content?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          id?: string
          is_bot?: boolean
          is_internal?: boolean
          is_us?: boolean
          landing_page?: string | null
          medium?: string | null
          pin_id?: string | null
          raw?: Json | null
          region?: string | null
          session_id?: string
          source?: string | null
          started_at?: string
          term?: string | null
          video_id?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      github_sync_alerts: {
        Row: {
          ahead_by: number
          behind_by: number
          branch: string
          branch_sha: string
          created_at: string
          id: string
          main_sha: string
          message: string | null
          resolved: boolean
          resolved_at: string | null
        }
        Insert: {
          ahead_by?: number
          behind_by?: number
          branch: string
          branch_sha: string
          created_at?: string
          id?: string
          main_sha: string
          message?: string | null
          resolved?: boolean
          resolved_at?: string | null
        }
        Update: {
          ahead_by?: number
          behind_by?: number
          branch?: string
          branch_sha?: string
          created_at?: string
          id?: string
          main_sha?: string
          message?: string | null
          resolved?: boolean
          resolved_at?: string | null
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
      growth_autopilot_config: {
        Row: {
          category_whitelist: string[]
          emergency_stop: boolean
          enabled: boolean
          id: number
          max_pins_per_day: number
          min_product_score: number
          mode: string
          paused_publishing: boolean
          updated_at: string
        }
        Insert: {
          category_whitelist?: string[]
          emergency_stop?: boolean
          enabled?: boolean
          id?: number
          max_pins_per_day?: number
          min_product_score?: number
          mode?: string
          paused_publishing?: boolean
          updated_at?: string
        }
        Update: {
          category_whitelist?: string[]
          emergency_stop?: boolean
          enabled?: boolean
          id?: number
          max_pins_per_day?: number
          min_product_score?: number
          mode?: string
          paused_publishing?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      growth_channel_budget: {
        Row: {
          allocated: number
          autopilot: boolean
          channel: string
          daily_budget: number
          last_allocation_at: string | null
          meta: Json
          share_pct: number
          updated_at: string
        }
        Insert: {
          allocated?: number
          autopilot?: boolean
          channel: string
          daily_budget?: number
          last_allocation_at?: string | null
          meta?: Json
          share_pct?: number
          updated_at?: string
        }
        Update: {
          allocated?: number
          autopilot?: boolean
          channel?: string
          daily_budget?: number
          last_allocation_at?: string | null
          meta?: Json
          share_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      growth_channel_signals: {
        Row: {
          channel: string
          clicks: number
          conversions: number
          created_at: string
          day: string
          id: string
          impressions: number
          meta: Json
          product_id: string | null
          product_slug: string | null
          revenue: number
          score: number
          spend: number
        }
        Insert: {
          channel: string
          clicks?: number
          conversions?: number
          created_at?: string
          day?: string
          id?: string
          impressions?: number
          meta?: Json
          product_id?: string | null
          product_slug?: string | null
          revenue?: number
          score?: number
          spend?: number
        }
        Update: {
          channel?: string
          clicks?: number
          conversions?: number
          created_at?: string
          day?: string
          id?: string
          impressions?: number
          meta?: Json
          product_id?: string | null
          product_slug?: string | null
          revenue?: number
          score?: number
          spend?: number
        }
        Relationships: []
      }
      growth_competitor_insights: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          meta: Json
          observed_at: string
          pattern_type: string
          summary: string | null
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          meta?: Json
          observed_at?: string
          pattern_type: string
          summary?: string | null
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          meta?: Json
          observed_at?: string
          pattern_type?: string
          summary?: string | null
        }
        Relationships: []
      }
      growth_creative_dna: {
        Row: {
          clicks: number
          created_at: string
          ewma_reward: number
          gene_type: string
          gene_value: string
          generation: number
          id: string
          impressions: number
          last_test_at: string | null
          meta: Json
          parent_id: string | null
          retired_at: string | null
          reward: number
          sample_size: number
          status: string
          updated_at: string
        }
        Insert: {
          clicks?: number
          created_at?: string
          ewma_reward?: number
          gene_type: string
          gene_value: string
          generation?: number
          id?: string
          impressions?: number
          last_test_at?: string | null
          meta?: Json
          parent_id?: string | null
          retired_at?: string | null
          reward?: number
          sample_size?: number
          status?: string
          updated_at?: string
        }
        Update: {
          clicks?: number
          created_at?: string
          ewma_reward?: number
          gene_type?: string
          gene_value?: string
          generation?: number
          id?: string
          impressions?: number
          last_test_at?: string | null
          meta?: Json
          parent_id?: string | null
          retired_at?: string | null
          reward?: number
          sample_size?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_creative_dna_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "growth_creative_dna"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_decision_metrics: {
        Row: {
          clicks: number
          created_at: string
          ctr: number
          decision_id: string
          id: string
          impressions: number
          meta: Json
          pin_count: number
          reward: number
          saves: number
          snapshot_day: string
        }
        Insert: {
          clicks?: number
          created_at?: string
          ctr?: number
          decision_id: string
          id?: string
          impressions?: number
          meta?: Json
          pin_count?: number
          reward?: number
          saves?: number
          snapshot_day?: string
        }
        Update: {
          clicks?: number
          created_at?: string
          ctr?: number
          decision_id?: string
          id?: string
          impressions?: number
          meta?: Json
          pin_count?: number
          reward?: number
          saves?: number
          snapshot_day?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_decision_metrics_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "growth_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_decisions: {
        Row: {
          created_at: string
          day: string
          decision_type: string
          id: string
          payload: Json
          product_id: string | null
          reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day?: string
          decision_type: string
          id?: string
          payload?: Json
          product_id?: string | null
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day?: string
          decision_type?: string
          id?: string
          payload?: Json
          product_id?: string | null
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      growth_events: {
        Row: {
          created_at: string
          decision_id: string | null
          event_type: string
          id: string
          payload: Json
          product_id: string | null
          trace_id: string | null
        }
        Insert: {
          created_at?: string
          decision_id?: string | null
          event_type: string
          id?: string
          payload?: Json
          product_id?: string | null
          trace_id?: string | null
        }
        Update: {
          created_at?: string
          decision_id?: string | null
          event_type?: string
          id?: string
          payload?: Json
          product_id?: string | null
          trace_id?: string | null
        }
        Relationships: []
      }
      growth_forecasts: {
        Row: {
          computed_at: string
          confidence: number
          entity_key: string
          entity_type: string
          forecast_revenue: number
          forecast_reward: number
          horizon_days: number
          id: string
          meta: Json
          rising: boolean
          sample_size: number
          trend_slope: number
        }
        Insert: {
          computed_at?: string
          confidence?: number
          entity_key: string
          entity_type: string
          forecast_revenue?: number
          forecast_reward?: number
          horizon_days: number
          id?: string
          meta?: Json
          rising?: boolean
          sample_size?: number
          trend_slope?: number
        }
        Update: {
          computed_at?: string
          confidence?: number
          entity_key?: string
          entity_type?: string
          forecast_revenue?: number
          forecast_reward?: number
          horizon_days?: number
          id?: string
          meta?: Json
          rising?: boolean
          sample_size?: number
          trend_slope?: number
        }
        Relationships: []
      }
      growth_keyword_opportunities: {
        Row: {
          created_at: string
          fit_category: string | null
          id: string
          intent: string | null
          keyword: string
          meta: Json
          score: number
          updated_at: string
          volume: number | null
        }
        Insert: {
          created_at?: string
          fit_category?: string | null
          id?: string
          intent?: string | null
          keyword: string
          meta?: Json
          score?: number
          updated_at?: string
          volume?: number | null
        }
        Update: {
          created_at?: string
          fit_category?: string | null
          id?: string
          intent?: string | null
          keyword?: string
          meta?: Json
          score?: number
          updated_at?: string
          volume?: number | null
        }
        Relationships: []
      }
      growth_market_trends: {
        Row: {
          captured_at: string
          category: string | null
          created_at: string
          id: string
          market: string
          meta: Json
          momentum: number
          score: number
          season: string | null
          source: string
          term: string
        }
        Insert: {
          captured_at?: string
          category?: string | null
          created_at?: string
          id?: string
          market?: string
          meta?: Json
          momentum?: number
          score?: number
          season?: string | null
          source: string
          term: string
        }
        Update: {
          captured_at?: string
          category?: string | null
          created_at?: string
          id?: string
          market?: string
          meta?: Json
          momentum?: number
          score?: number
          season?: string | null
          source?: string
          term?: string
        }
        Relationships: []
      }
      growth_product_scores: {
        Row: {
          confidence_score: number
          created_at: string
          day: string
          id: string
          opportunity_score: number
          product_id: string
          reasons: Json
          recommended_angle: string | null
          recommended_channel: string | null
          recommended_hook: string | null
          signals: Json
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          day?: string
          id?: string
          opportunity_score?: number
          product_id: string
          reasons?: Json
          recommended_angle?: string | null
          recommended_channel?: string | null
          recommended_hook?: string | null
          signals?: Json
        }
        Update: {
          confidence_score?: number
          created_at?: string
          day?: string
          id?: string
          opportunity_score?: number
          product_id?: string
          reasons?: Json
          recommended_angle?: string | null
          recommended_channel?: string | null
          recommended_hook?: string | null
          signals?: Json
        }
        Relationships: []
      }
      growth_seasonal_opportunities: {
        Row: {
          active_from: string | null
          active_to: string | null
          categories: string[]
          created_at: string
          id: string
          lift_score: number
          meta: Json
          period: string
          theme: string
        }
        Insert: {
          active_from?: string | null
          active_to?: string | null
          categories?: string[]
          created_at?: string
          id?: string
          lift_score?: number
          meta?: Json
          period: string
          theme: string
        }
        Update: {
          active_from?: string | null
          active_to?: string | null
          categories?: string[]
          created_at?: string
          id?: string
          lift_score?: number
          meta?: Json
          period?: string
          theme?: string
        }
        Relationships: []
      }
      growth_strategy_scores: {
        Row: {
          dimension: string
          id: string
          key: string
          meta: Json
          samples: number
          score: number
          updated_at: string
        }
        Insert: {
          dimension: string
          id?: string
          key: string
          meta?: Json
          samples?: number
          score?: number
          updated_at?: string
        }
        Update: {
          dimension?: string
          id?: string
          key?: string
          meta?: Json
          samples?: number
          score?: number
          updated_at?: string
        }
        Relationships: []
      }
      growth_viral_hook_patterns: {
        Row: {
          created_at: string
          family: string | null
          hook: string
          id: string
          meta: Json
          performance_score: number
          samples: number
          structure: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          family?: string | null
          hook: string
          id?: string
          meta?: Json
          performance_score?: number
          samples?: number
          structure?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          family?: string | null
          hook?: string
          id?: string
          meta?: Json
          performance_score?: number
          samples?: number
          structure?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      growth_weekly_reports: {
        Row: {
          created_at: string
          id: string
          payload: Json
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          week_start?: string
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
      lp_funnel_events: {
        Row: {
          bot_reason: string | null
          cohort: string | null
          created_at: string
          cta_copy_label: string | null
          cta_copy_mode: string | null
          cta_copy_source: string | null
          cta_variant: string | null
          deduped: boolean | null
          delta_ms: number | null
          dwell_ms: number | null
          event_name: string
          event_source: string | null
          first_click_placement: string | null
          funnel: string | null
          geo_quality: string | null
          hook_family: string | null
          id: string
          idempotency_key: string | null
          is_bot: boolean | null
          is_first_click: boolean | null
          is_internal: boolean | null
          is_misclick: boolean | null
          is_repeat_click: boolean | null
          lp_click_id: string | null
          lp_placement: string | null
          page_path: string | null
          placement: string | null
          previous_placement: string | null
          product_id: string | null
          product_name: string | null
          raw_payload: Json | null
          repeat_index: number | null
          scroll_depth_at_click: number | null
          scroll_depth_at_visible: number | null
          session_id: string
          source_component: string | null
          time_to_click_ms: number | null
          time_to_visible_ms: number | null
          traffic_quality_score: number | null
          user_action_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          validation_status: string | null
          value: number | null
        }
        Insert: {
          bot_reason?: string | null
          cohort?: string | null
          created_at?: string
          cta_copy_label?: string | null
          cta_copy_mode?: string | null
          cta_copy_source?: string | null
          cta_variant?: string | null
          deduped?: boolean | null
          delta_ms?: number | null
          dwell_ms?: number | null
          event_name: string
          event_source?: string | null
          first_click_placement?: string | null
          funnel?: string | null
          geo_quality?: string | null
          hook_family?: string | null
          id?: string
          idempotency_key?: string | null
          is_bot?: boolean | null
          is_first_click?: boolean | null
          is_internal?: boolean | null
          is_misclick?: boolean | null
          is_repeat_click?: boolean | null
          lp_click_id?: string | null
          lp_placement?: string | null
          page_path?: string | null
          placement?: string | null
          previous_placement?: string | null
          product_id?: string | null
          product_name?: string | null
          raw_payload?: Json | null
          repeat_index?: number | null
          scroll_depth_at_click?: number | null
          scroll_depth_at_visible?: number | null
          session_id: string
          source_component?: string | null
          time_to_click_ms?: number | null
          time_to_visible_ms?: number | null
          traffic_quality_score?: number | null
          user_action_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          validation_status?: string | null
          value?: number | null
        }
        Update: {
          bot_reason?: string | null
          cohort?: string | null
          created_at?: string
          cta_copy_label?: string | null
          cta_copy_mode?: string | null
          cta_copy_source?: string | null
          cta_variant?: string | null
          deduped?: boolean | null
          delta_ms?: number | null
          dwell_ms?: number | null
          event_name?: string
          event_source?: string | null
          first_click_placement?: string | null
          funnel?: string | null
          geo_quality?: string | null
          hook_family?: string | null
          id?: string
          idempotency_key?: string | null
          is_bot?: boolean | null
          is_first_click?: boolean | null
          is_internal?: boolean | null
          is_misclick?: boolean | null
          is_repeat_click?: boolean | null
          lp_click_id?: string | null
          lp_placement?: string | null
          page_path?: string | null
          placement?: string | null
          previous_placement?: string | null
          product_id?: string | null
          product_name?: string | null
          raw_payload?: Json | null
          repeat_index?: number | null
          scroll_depth_at_click?: number | null
          scroll_depth_at_visible?: number | null
          session_id?: string
          source_component?: string | null
          time_to_click_ms?: number | null
          time_to_visible_ms?: number | null
          traffic_quality_score?: number | null
          user_action_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          validation_status?: string | null
          value?: number | null
        }
        Relationships: []
      }
      market_ai_recommendations: {
        Row: {
          action: string
          confidence: number | null
          created_at: string
          id: string
          payload: Json
          reasoning: string | null
          status: string
          target_id: string | null
          target_type: string
          updated_at: string
        }
        Insert: {
          action: string
          confidence?: number | null
          created_at?: string
          id?: string
          payload?: Json
          reasoning?: string | null
          status?: string
          target_id?: string | null
          target_type: string
          updated_at?: string
        }
        Update: {
          action?: string
          confidence?: number | null
          created_at?: string
          id?: string
          payload?: Json
          reasoning?: string | null
          status?: string
          target_id?: string | null
          target_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      market_alerts: {
        Row: {
          category: string
          cooldown_until: string | null
          created_at: string
          dedup_key: string
          detail: string | null
          id: string
          occurrences: number
          payload: Json
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          cooldown_until?: string | null
          created_at?: string
          dedup_key: string
          detail?: string | null
          id?: string
          occurrences?: number
          payload?: Json
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          cooldown_until?: string | null
          created_at?: string
          dedup_key?: string
          detail?: string | null
          id?: string
          occurrences?: number
          payload?: Json
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      market_competitor_insights: {
        Row: {
          captured_at: string
          competitor: string
          created_at: string
          id: string
          image_url: string | null
          insights: Json
          price: number | null
          product_handle: string
          rating: number | null
          review_count: number | null
          title: string | null
        }
        Insert: {
          captured_at?: string
          competitor: string
          created_at?: string
          id?: string
          image_url?: string | null
          insights?: Json
          price?: number | null
          product_handle: string
          rating?: number | null
          review_count?: number | null
          title?: string | null
        }
        Update: {
          captured_at?: string
          competitor?: string
          created_at?: string
          id?: string
          image_url?: string | null
          insights?: Json
          price?: number | null
          product_handle?: string
          rating?: number | null
          review_count?: number | null
          title?: string | null
        }
        Relationships: []
      }
      market_creative_patterns: {
        Row: {
          created_at: string
          ewma_score: number
          examples: Json
          id: string
          pattern_type: string
          sample_size: number
          signature: string
          status: string
          updated_at: string
          win_rate: number
        }
        Insert: {
          created_at?: string
          ewma_score?: number
          examples?: Json
          id?: string
          pattern_type: string
          sample_size?: number
          signature: string
          status?: string
          updated_at?: string
          win_rate?: number
        }
        Update: {
          created_at?: string
          ewma_score?: number
          examples?: Json
          id?: string
          pattern_type?: string
          sample_size?: number
          signature?: string
          status?: string
          updated_at?: string
          win_rate?: number
        }
        Relationships: []
      }
      market_dna_promotions: {
        Row: {
          cluster_id: string | null
          created_at: string
          gene_id: string | null
          id: string
          reason: string
        }
        Insert: {
          cluster_id?: string | null
          created_at?: string
          gene_id?: string | null
          id?: string
          reason: string
        }
        Update: {
          cluster_id?: string | null
          created_at?: string
          gene_id?: string | null
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_dna_promotions_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "market_trend_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_dna_promotions_gene_id_fkey"
            columns: ["gene_id"]
            isOneToOne: false
            referencedRelation: "growth_creative_dna"
            referencedColumns: ["id"]
          },
        ]
      }
      market_gap_action_items: {
        Row: {
          admin_notes: string | null
          approved_at: string | null
          created_at: string
          gap_id: string | null
          id: string
          priority_score: number
          rationale: string | null
          recommended_channels: Json
          recommended_creatives: Json
          routed_at: string | null
          status: string
          suggested_products: Json
          target_keywords: Json
          title: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          approved_at?: string | null
          created_at?: string
          gap_id?: string | null
          id?: string
          priority_score?: number
          rationale?: string | null
          recommended_channels?: Json
          recommended_creatives?: Json
          routed_at?: string | null
          status?: string
          suggested_products?: Json
          target_keywords?: Json
          title: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          approved_at?: string | null
          created_at?: string
          gap_id?: string | null
          id?: string
          priority_score?: number
          rationale?: string | null
          recommended_channels?: Json
          recommended_creatives?: Json
          routed_at?: string | null
          status?: string
          suggested_products?: Json
          target_keywords?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_gap_action_items_gap_id_fkey"
            columns: ["gap_id"]
            isOneToOne: false
            referencedRelation: "market_opportunity_gaps"
            referencedColumns: ["id"]
          },
        ]
      }
      market_growth_predictions: {
        Row: {
          computed_at: string
          confidence: number | null
          created_at: string
          horizon: string
          id: string
          momentum: number | null
          predicted_conversions: number | null
          predicted_revenue: number | null
          predicted_traffic: number | null
          product_id: string | null
        }
        Insert: {
          computed_at?: string
          confidence?: number | null
          created_at?: string
          horizon: string
          id?: string
          momentum?: number | null
          predicted_conversions?: number | null
          predicted_revenue?: number | null
          predicted_traffic?: number | null
          product_id?: string | null
        }
        Update: {
          computed_at?: string
          confidence?: number | null
          created_at?: string
          horizon?: string
          id?: string
          momentum?: number | null
          predicted_conversions?: number | null
          predicted_revenue?: number | null
          predicted_traffic?: number | null
          product_id?: string | null
        }
        Relationships: []
      }
      market_opportunity_gaps: {
        Row: {
          competitor: string | null
          created_at: string
          evidence: Json
          gap_type: string
          id: string
          matched_product_id: string | null
          opportunity_score: number
          status: string
          target: string
          updated_at: string
        }
        Insert: {
          competitor?: string | null
          created_at?: string
          evidence?: Json
          gap_type: string
          id?: string
          matched_product_id?: string | null
          opportunity_score?: number
          status?: string
          target: string
          updated_at?: string
        }
        Update: {
          competitor?: string | null
          created_at?: string
          evidence?: Json
          gap_type?: string
          id?: string
          matched_product_id?: string | null
          opportunity_score?: number
          status?: string
          target?: string
          updated_at?: string
        }
        Relationships: []
      }
      market_product_priority: {
        Row: {
          composite_score: number
          created_at: string
          day: string
          factors: Json
          id: string
          product_id: string
          rank: number
          rationale: string | null
          recommended_channels: string[]
          updated_at: string
        }
        Insert: {
          composite_score?: number
          created_at?: string
          day?: string
          factors?: Json
          id?: string
          product_id: string
          rank: number
          rationale?: string | null
          recommended_channels?: string[]
          updated_at?: string
        }
        Update: {
          composite_score?: number
          created_at?: string
          day?: string
          factors?: Json
          id?: string
          product_id?: string
          rank?: number
          rationale?: string | null
          recommended_channels?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_product_priority_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_product_priority_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      market_product_scores: {
        Row: {
          competition_quality: number | null
          created_at: string
          day: string
          factors: Json
          id: string
          margin_score: number | null
          market_score: number
          pinterest_potential: number | null
          priority: string
          product_id: string
          search_demand: number | null
          tiktok_potential: number | null
          trend_velocity: number | null
          updated_at: string
        }
        Insert: {
          competition_quality?: number | null
          created_at?: string
          day?: string
          factors?: Json
          id?: string
          margin_score?: number | null
          market_score?: number
          pinterest_potential?: number | null
          priority?: string
          product_id: string
          search_demand?: number | null
          tiktok_potential?: number | null
          trend_velocity?: number | null
          updated_at?: string
        }
        Update: {
          competition_quality?: number | null
          created_at?: string
          day?: string
          factors?: Json
          id?: string
          margin_score?: number | null
          market_score?: number
          pinterest_potential?: number | null
          priority?: string
          product_id?: string
          search_demand?: number | null
          tiktok_potential?: number | null
          trend_velocity?: number | null
          updated_at?: string
        }
        Relationships: []
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
      market_signal_failures: {
        Row: {
          created_at: string
          error: string
          id: string
          next_retry_at: string | null
          payload: Json
          resolved: boolean
          retry_count: number
          source_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          error: string
          id?: string
          next_retry_at?: string | null
          payload?: Json
          resolved?: boolean
          retry_count?: number
          source_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          error?: string
          id?: string
          next_retry_at?: string | null
          payload?: Json
          resolved?: boolean
          retry_count?: number
          source_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_signal_failures_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "market_signal_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      market_signal_logs: {
        Row: {
          created_at: string
          id: string
          level: string
          message: string
          payload: Json
          source_id: string | null
          trace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          level?: string
          message: string
          payload?: Json
          source_id?: string | null
          trace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          level?: string
          message?: string
          payload?: Json
          source_id?: string | null
          trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_signal_logs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "market_signal_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      market_signal_recovery_events: {
        Row: {
          action: string
          created_at: string
          id: string
          payload: Json
          result: string | null
          source_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          payload?: Json
          result?: string | null
          source_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          payload?: Json
          result?: string | null
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_signal_recovery_events_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "market_signal_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      market_signal_snapshots: {
        Row: {
          captured_at: string
          created_at: string
          hash: string | null
          id: string
          payload: Json
          source_id: string | null
        }
        Insert: {
          captured_at?: string
          created_at?: string
          hash?: string | null
          id?: string
          payload?: Json
          source_id?: string | null
        }
        Update: {
          captured_at?: string
          created_at?: string
          hash?: string | null
          id?: string
          payload?: Json
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_signal_snapshots_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "market_signal_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      market_signal_sources: {
        Row: {
          base_url: string | null
          config: Json
          created_at: string
          enabled: boolean
          id: string
          kind: string
          last_run_at: string | null
          last_status: string | null
          name: string
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          kind: string
          last_run_at?: string | null
          last_status?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      market_trend_clusters: {
        Row: {
          cluster_key: string
          created_at: string
          examples: Json
          first_seen_at: string
          id: string
          keywords: string[]
          label: string
          last_seen_at: string
          meta: Json
          sample_size: number
          signal_score: number
          source: string
          status: string
          updated_at: string
          velocity: number
        }
        Insert: {
          cluster_key: string
          created_at?: string
          examples?: Json
          first_seen_at?: string
          id?: string
          keywords?: string[]
          label: string
          last_seen_at?: string
          meta?: Json
          sample_size?: number
          signal_score?: number
          source: string
          status?: string
          updated_at?: string
          velocity?: number
        }
        Update: {
          cluster_key?: string
          created_at?: string
          examples?: Json
          first_seen_at?: string
          id?: string
          keywords?: string[]
          label?: string
          last_seen_at?: string
          meta?: Json
          sample_size?: number
          signal_score?: number
          source?: string
          status?: string
          updated_at?: string
          velocity?: number
        }
        Relationships: []
      }
      market_trending_products: {
        Row: {
          captured_at: string
          category: string | null
          created_at: string
          external_id: string | null
          id: string
          matched_product_id: string | null
          metadata: Json
          rank: number | null
          source: string
          title: string
          velocity: number | null
        }
        Insert: {
          captured_at?: string
          category?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          matched_product_id?: string | null
          metadata?: Json
          rank?: number | null
          source: string
          title: string
          velocity?: number | null
        }
        Update: {
          captured_at?: string
          category?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          matched_product_id?: string | null
          metadata?: Json
          rank?: number | null
          source?: string
          title?: string
          velocity?: number | null
        }
        Relationships: []
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
      mi_arm_revenue: {
        Row: {
          channel: string
          computed_at: string
          conversions: number
          est_spend: number
          hook_family: string
          id: string
          metadata: Json
          rev_per_click: number
          revenue: number
          roas: number
          window_days: number
        }
        Insert: {
          channel: string
          computed_at?: string
          conversions?: number
          est_spend?: number
          hook_family: string
          id?: string
          metadata?: Json
          rev_per_click?: number
          revenue?: number
          roas?: number
          window_days?: number
        }
        Update: {
          channel?: string
          computed_at?: string
          conversions?: number
          est_spend?: number
          hook_family?: string
          id?: string
          metadata?: Json
          rev_per_click?: number
          revenue?: number
          roas?: number
          window_days?: number
        }
        Relationships: []
      }
      mi_audience_clusters: {
        Row: {
          channel: string
          cohort_key: string
          cohort_landing: string | null
          cohort_source: string | null
          computed_at: string
          conversions: number
          hook_family: string
          id: string
          metadata: Json
          revenue: number
          share: number
        }
        Insert: {
          channel: string
          cohort_key: string
          cohort_landing?: string | null
          cohort_source?: string | null
          computed_at?: string
          conversions?: number
          hook_family: string
          id?: string
          metadata?: Json
          revenue?: number
          share?: number
        }
        Update: {
          channel?: string
          cohort_key?: string
          cohort_landing?: string | null
          cohort_source?: string | null
          computed_at?: string
          conversions?: number
          hook_family?: string
          id?: string
          metadata?: Json
          revenue?: number
          share?: number
        }
        Relationships: []
      }
      mi_channel_metrics: {
        Row: {
          captured_at: string
          channel: string
          clicks: number
          composite_score: number
          conversions: number
          created_at: string
          ctr: number
          external_id: string | null
          hook_family: string | null
          id: string
          impressions: number
          product_id: string | null
          queue_id: string
          save_rate: number
          saves: number
          updated_at: string
          view_rate: number
          views: number
        }
        Insert: {
          captured_at?: string
          channel: string
          clicks?: number
          composite_score?: number
          conversions?: number
          created_at?: string
          ctr?: number
          external_id?: string | null
          hook_family?: string | null
          id?: string
          impressions?: number
          product_id?: string | null
          queue_id: string
          save_rate?: number
          saves?: number
          updated_at?: string
          view_rate?: number
          views?: number
        }
        Update: {
          captured_at?: string
          channel?: string
          clicks?: number
          composite_score?: number
          conversions?: number
          created_at?: string
          ctr?: number
          external_id?: string | null
          hook_family?: string | null
          id?: string
          impressions?: number
          product_id?: string | null
          queue_id?: string
          save_rate?: number
          saves?: number
          updated_at?: string
          view_rate?: number
          views?: number
        }
        Relationships: []
      }
      mi_competitor_observations: {
        Row: {
          aesthetic_category: string | null
          competitor_id: string | null
          created_at: string
          cta_type: string | null
          est_engagement: number | null
          hook_type: string | null
          id: string
          lp_notes: string | null
          market: string
          observed_at: string
          platform: string | null
          posting_cadence: string | null
          product_category: string | null
          structure: string | null
          thumbnail_pattern: string | null
          trust_signals: string | null
          url: string
          visual_style: string | null
        }
        Insert: {
          aesthetic_category?: string | null
          competitor_id?: string | null
          created_at?: string
          cta_type?: string | null
          est_engagement?: number | null
          hook_type?: string | null
          id?: string
          lp_notes?: string | null
          market?: string
          observed_at?: string
          platform?: string | null
          posting_cadence?: string | null
          product_category?: string | null
          structure?: string | null
          thumbnail_pattern?: string | null
          trust_signals?: string | null
          url: string
          visual_style?: string | null
        }
        Update: {
          aesthetic_category?: string | null
          competitor_id?: string | null
          created_at?: string
          cta_type?: string | null
          est_engagement?: number | null
          hook_type?: string | null
          id?: string
          lp_notes?: string | null
          market?: string
          observed_at?: string
          platform?: string | null
          posting_cadence?: string | null
          product_category?: string | null
          structure?: string | null
          thumbnail_pattern?: string | null
          trust_signals?: string | null
          url?: string
          visual_style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mi_competitor_observations_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "mi_competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      mi_competitors: {
        Row: {
          category: string | null
          created_at: string
          domain: string | null
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          domain?: string | null
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          domain?: string | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mi_creative_recipes: {
        Row: {
          active: boolean
          benefit_framing: string | null
          created_at: string
          cta_timing: string | null
          curiosity_pattern: string | null
          emotional_angle: string | null
          first_3s_structure: string | null
          hook_family: string | null
          id: string
          name: string
          overlay_style: string | null
          pacing: string | null
          pain_framing: string | null
          palette_category: string | null
          product_positioning: string | null
          scene_density: string | null
          score: number
          social_proof_structure: string | null
          source_refs: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          benefit_framing?: string | null
          created_at?: string
          cta_timing?: string | null
          curiosity_pattern?: string | null
          emotional_angle?: string | null
          first_3s_structure?: string | null
          hook_family?: string | null
          id?: string
          name: string
          overlay_style?: string | null
          pacing?: string | null
          pain_framing?: string | null
          palette_category?: string | null
          product_positioning?: string | null
          scene_density?: string | null
          score?: number
          social_proof_structure?: string | null
          source_refs?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          benefit_framing?: string | null
          created_at?: string
          cta_timing?: string | null
          curiosity_pattern?: string | null
          emotional_angle?: string | null
          first_3s_structure?: string | null
          hook_family?: string | null
          id?: string
          name?: string
          overlay_style?: string | null
          pacing?: string | null
          pain_framing?: string | null
          palette_category?: string | null
          product_positioning?: string | null
          scene_density?: string | null
          score?: number
          social_proof_structure?: string | null
          source_refs?: Json
          updated_at?: string
        }
        Relationships: []
      }
      mi_experiment_events: {
        Row: {
          event_type: string
          id: number
          metadata: Json
          occurred_at: string
          variant_id: string
          weight: number
        }
        Insert: {
          event_type: string
          id?: number
          metadata?: Json
          occurred_at?: string
          variant_id: string
          weight?: number
        }
        Update: {
          event_type?: string
          id?: number
          metadata?: Json
          occurred_at?: string
          variant_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "mi_experiment_events_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "mi_experiment_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      mi_experiment_variants: {
        Row: {
          clicks: number
          conversions: number
          created_at: string
          experiment_id: string
          id: string
          impressions: number
          label: string
          pin_queue_id: string | null
          posterior_win_prob: number
          remix_draft_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          clicks?: number
          conversions?: number
          created_at?: string
          experiment_id: string
          id?: string
          impressions?: number
          label: string
          pin_queue_id?: string | null
          posterior_win_prob?: number
          remix_draft_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          clicks?: number
          conversions?: number
          created_at?: string
          experiment_id?: string
          id?: string
          impressions?: number
          label?: string
          pin_queue_id?: string | null
          posterior_win_prob?: number
          remix_draft_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mi_experiment_variants_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "mi_experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      mi_experiments: {
        Row: {
          created_at: string
          ended_at: string | null
          hook_family: string | null
          id: string
          metadata: Json
          name: string
          placement: string
          started_at: string
          status: string
          updated_at: string
          winner_variant_id: string | null
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          hook_family?: string | null
          id?: string
          metadata?: Json
          name: string
          placement?: string
          started_at?: string
          status?: string
          updated_at?: string
          winner_variant_id?: string | null
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          hook_family?: string | null
          id?: string
          metadata?: Json
          name?: string
          placement?: string
          started_at?: string
          status?: string
          updated_at?: string
          winner_variant_id?: string | null
        }
        Relationships: []
      }
      mi_opportunities: {
        Row: {
          created_at: string
          evidence: Json
          id: string
          market: string
          score: number
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence?: Json
          id?: string
          market?: string
          score?: number
          status?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence?: Json
          id?: string
          market?: string
          score?: number
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      mi_recipe_performance: {
        Row: {
          avg_ctr: number
          avg_engagement_rate: number
          composite_score: number
          computed_at: string
          drafts_count: number
          id: string
          pins_count: number
          recipe_id: string
          total_clicks: number
          total_engagements: number
          total_impressions: number
          videos_count: number
          window_days: number
        }
        Insert: {
          avg_ctr?: number
          avg_engagement_rate?: number
          composite_score?: number
          computed_at?: string
          drafts_count?: number
          id?: string
          pins_count?: number
          recipe_id: string
          total_clicks?: number
          total_engagements?: number
          total_impressions?: number
          videos_count?: number
          window_days: number
        }
        Update: {
          avg_ctr?: number
          avg_engagement_rate?: number
          composite_score?: number
          computed_at?: string
          drafts_count?: number
          id?: string
          pins_count?: number
          recipe_id?: string
          total_clicks?: number
          total_engagements?: number
          total_impressions?: number
          videos_count?: number
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "mi_recipe_performance_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "mi_creative_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      mi_recommendations: {
        Row: {
          body: string
          category: string | null
          confidence: number
          created_at: string
          evidence_refs: Json
          id: string
          market: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string | null
          confidence?: number
          created_at?: string
          evidence_refs?: Json
          id?: string
          market?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string | null
          confidence?: number
          created_at?: string
          evidence_refs?: Json
          id?: string
          market?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      mi_remix_drafts: {
        Row: {
          compliance_flags: Json
          created_at: string
          generated_brief: string | null
          generated_copy: string | null
          id: string
          last_scored_at: string | null
          performance_score: number
          product_id: string | null
          published_at: string | null
          published_pin_id: string | null
          published_video_id: string | null
          recipe_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          compliance_flags?: Json
          created_at?: string
          generated_brief?: string | null
          generated_copy?: string | null
          id?: string
          last_scored_at?: string | null
          performance_score?: number
          product_id?: string | null
          published_at?: string | null
          published_pin_id?: string | null
          published_video_id?: string | null
          recipe_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          compliance_flags?: Json
          created_at?: string
          generated_brief?: string | null
          generated_copy?: string | null
          id?: string
          last_scored_at?: string | null
          performance_score?: number
          product_id?: string | null
          published_at?: string | null
          published_pin_id?: string | null
          published_video_id?: string | null
          recipe_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mi_remix_drafts_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "mi_creative_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      mi_seasonal_forecasts: {
        Row: {
          category: string
          confidence: number
          created_at: string
          expected_lift: number
          id: string
          market: string
          notes: string | null
          week_of_year: number
        }
        Insert: {
          category: string
          confidence?: number
          created_at?: string
          expected_lift?: number
          id?: string
          market?: string
          notes?: string | null
          week_of_year: number
        }
        Update: {
          category?: string
          confidence?: number
          created_at?: string
          expected_lift?: number
          id?: string
          market?: string
          notes?: string | null
          week_of_year?: number
        }
        Relationships: []
      }
      mi_trend_signals: {
        Row: {
          captured_at: string
          id: string
          market: string
          meta: Json
          source: string
          trend_id: string | null
          value: number
        }
        Insert: {
          captured_at?: string
          id?: string
          market?: string
          meta?: Json
          source: string
          trend_id?: string | null
          value?: number
        }
        Update: {
          captured_at?: string
          id?: string
          market?: string
          meta?: Json
          source?: string
          trend_id?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "mi_trend_signals_trend_id_fkey"
            columns: ["trend_id"]
            isOneToOne: false
            referencedRelation: "mi_trends"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mi_trend_signals_trend_id_fkey"
            columns: ["trend_id"]
            isOneToOne: false
            referencedRelation: "us_mi_trends_v"
            referencedColumns: ["id"]
          },
        ]
      }
      mi_trends: {
        Row: {
          category: string | null
          created_at: string
          first_seen: string
          id: string
          last_seen: string
          market: string
          momentum: number
          notes: string | null
          score: number
          season: string | null
          source: string
          term: string
          trend_type: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          first_seen?: string
          id?: string
          last_seen?: string
          market?: string
          momentum?: number
          notes?: string | null
          score?: number
          season?: string | null
          source?: string
          term: string
          trend_type: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          first_seen?: string
          id?: string
          last_seen?: string
          market?: string
          momentum?: number
          notes?: string | null
          score?: number
          season?: string | null
          source?: string
          term?: string
          trend_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      mi_tuning_runs: {
        Row: {
          hook_multipliers: Json
          id: string
          notes: string | null
          ran_at: string
          recipes_boosted: number
          recipes_deactivated: number
          recipes_decayed: number
          recipes_evaluated: number
          threshold_after: number | null
          threshold_before: number | null
          window_days: number
        }
        Insert: {
          hook_multipliers?: Json
          id?: string
          notes?: string | null
          ran_at?: string
          recipes_boosted?: number
          recipes_deactivated?: number
          recipes_decayed?: number
          recipes_evaluated?: number
          threshold_after?: number | null
          threshold_before?: number | null
          window_days?: number
        }
        Update: {
          hook_multipliers?: Json
          id?: string
          notes?: string | null
          ran_at?: string
          recipes_boosted?: number
          recipes_deactivated?: number
          recipes_decayed?: number
          recipes_evaluated?: number
          threshold_after?: number | null
          threshold_before?: number | null
          window_days?: number
        }
        Relationships: []
      }
      mi_tuning_state: {
        Row: {
          id: string
          key: string
          metadata: Json
          scope: string
          updated_at: string
          value: number
        }
        Insert: {
          id?: string
          key: string
          metadata?: Json
          scope: string
          updated_at?: string
          value: number
        }
        Update: {
          id?: string
          key?: string
          metadata?: Json
          scope?: string
          updated_at?: string
          value?: number
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
          duration_ms: number | null
          error_message: string | null
          function_name: string | null
          id: string
          new_alerts: string[]
          results: Json
          run_type: string
          started_at: string
          status: string | null
          success: boolean | null
          trace_id: string | null
          watches_total: number | null
          watches_unhealthy: number | null
        }
        Insert: {
          checks_failed?: number | null
          checks_passed?: number | null
          completed_at?: string | null
          created_at?: string
          details?: Json | null
          duration_ms?: number | null
          error_message?: string | null
          function_name?: string | null
          id?: string
          new_alerts?: string[]
          results?: Json
          run_type: string
          started_at?: string
          status?: string | null
          success?: boolean | null
          trace_id?: string | null
          watches_total?: number | null
          watches_unhealthy?: number | null
        }
        Update: {
          checks_failed?: number | null
          checks_passed?: number | null
          completed_at?: string | null
          created_at?: string
          details?: Json | null
          duration_ms?: number | null
          error_message?: string | null
          function_name?: string | null
          id?: string
          new_alerts?: string[]
          results?: Json
          run_type?: string
          started_at?: string
          status?: string | null
          success?: boolean | null
          trace_id?: string | null
          watches_total?: number | null
          watches_unhealthy?: number | null
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
          is_klarna: boolean
          items: Json
          order_access_token: string | null
          payment_method: string | null
          payment_method_detected_at: string | null
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
          is_klarna?: boolean
          items: Json
          order_access_token?: string | null
          payment_method?: string | null
          payment_method_detected_at?: string | null
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
          is_klarna?: boolean
          items?: Json
          order_access_token?: string | null
          payment_method?: string | null
          payment_method_detected_at?: string | null
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
      pinterest_ai_backdrops: {
        Row: {
          created_at: string
          height: number | null
          image_url: string
          phash: string | null
          query: string
          storage_path: string | null
          updated_at: string
          width: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          image_url: string
          phash?: string | null
          query: string
          storage_path?: string | null
          updated_at?: string
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          image_url?: string
          phash?: string | null
          query?: string
          storage_path?: string | null
          updated_at?: string
          width?: number | null
        }
        Relationships: []
      }
      pinterest_analytics_daily: {
        Row: {
          ctr: number
          day: string
          engagement_rate: number
          fetched_at: string
          id: string
          impressions: number
          outbound_clicks: number
          pin_clicks: number
          pin_id: string
          quality_score: number | null
          raw: Json | null
          saves: number
          video_views: number
        }
        Insert: {
          ctr?: number
          day: string
          engagement_rate?: number
          fetched_at?: string
          id?: string
          impressions?: number
          outbound_clicks?: number
          pin_clicks?: number
          pin_id: string
          quality_score?: number | null
          raw?: Json | null
          saves?: number
          video_views?: number
        }
        Update: {
          ctr?: number
          day?: string
          engagement_rate?: number
          fetched_at?: string
          id?: string
          impressions?: number
          outbound_clicks?: number
          pin_clicks?: number
          pin_id?: string
          quality_score?: number | null
          raw?: Json | null
          saves?: number
          video_views?: number
        }
        Relationships: []
      }
      pinterest_archetype_cooldown: {
        Row: {
          archetype: string
          cooldown_minutes: number
          last_published_at: string | null
          updated_at: string
        }
        Insert: {
          archetype: string
          cooldown_minutes?: number
          last_published_at?: string | null
          updated_at?: string
        }
        Update: {
          archetype?: string
          cooldown_minutes?: number
          last_published_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pinterest_attribution_sessions: {
        Row: {
          events_seen: number
          first_seen: string
          hook_category: string | null
          id: string
          landing_slug: string | null
          last_seen: string
          niche_key: string | null
          pin_id: string | null
          pin_mode: string | null
          session_key: string
          utm_campaign: string | null
          utm_content: string | null
          utm_source: string | null
        }
        Insert: {
          events_seen?: number
          first_seen?: string
          hook_category?: string | null
          id?: string
          landing_slug?: string | null
          last_seen?: string
          niche_key?: string | null
          pin_id?: string | null
          pin_mode?: string | null
          session_key: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_source?: string | null
        }
        Update: {
          events_seen?: number
          first_seen?: string
          hook_category?: string | null
          id?: string
          landing_slug?: string | null
          last_seen?: string
          niche_key?: string | null
          pin_id?: string | null
          pin_mode?: string | null
          session_key?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      pinterest_autopilot_config: {
        Row: {
          daily_post_target: number
          enabled: boolean
          id: number
          last_schedule_generated_for: string | null
          min_gap_minutes: number
          quality_threshold: number
          updated_at: string
        }
        Insert: {
          daily_post_target?: number
          enabled?: boolean
          id?: number
          last_schedule_generated_for?: string | null
          min_gap_minutes?: number
          quality_threshold?: number
          updated_at?: string
        }
        Update: {
          daily_post_target?: number
          enabled?: boolean
          id?: number
          last_schedule_generated_for?: string | null
          min_gap_minutes?: number
          quality_threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      pinterest_autopilot_decisions: {
        Row: {
          action: string
          created_at: string
          expected_fit: number | null
          id: string
          pin_queue_id: string | null
          product_category: string | null
          product_id: string
          product_name: string | null
          product_slug: string | null
          reason: string | null
          run_id: string | null
          score_breakdown: Json
          selected_board_id: string | null
          selected_board_name: string | null
          selected_hook_category: string | null
          status: string
          total_score: number
        }
        Insert: {
          action?: string
          created_at?: string
          expected_fit?: number | null
          id?: string
          pin_queue_id?: string | null
          product_category?: string | null
          product_id: string
          product_name?: string | null
          product_slug?: string | null
          reason?: string | null
          run_id?: string | null
          score_breakdown?: Json
          selected_board_id?: string | null
          selected_board_name?: string | null
          selected_hook_category?: string | null
          status?: string
          total_score?: number
        }
        Update: {
          action?: string
          created_at?: string
          expected_fit?: number | null
          id?: string
          pin_queue_id?: string | null
          product_category?: string | null
          product_id?: string
          product_name?: string | null
          product_slug?: string | null
          reason?: string | null
          run_id?: string | null
          score_breakdown?: Json
          selected_board_id?: string | null
          selected_board_name?: string | null
          selected_hook_category?: string | null
          status?: string
          total_score?: number
        }
        Relationships: []
      }
      pinterest_autopilot_overrides: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          product_id: string
          reason: string | null
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          product_id: string
          reason?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          product_id?: string
          reason?: string | null
        }
        Relationships: []
      }
      pinterest_autopilot_schedule: {
        Row: {
          attempt_count: number
          cinematic_ad_job_id: string | null
          created_at: string
          creative_angle: string | null
          hashtags: string[] | null
          id: string
          log: Json
          notes: string | null
          pin_description: string | null
          pin_title: string | null
          pinterest_pin_id: string | null
          pinterest_pin_url: string | null
          product_id: string | null
          product_image: string | null
          product_name: string | null
          product_slug: string
          product_url: string | null
          published_at: string | null
          scheduled_at: string
          scheduled_date: string
          skip_reason: string | null
          status: string
          updated_at: string
          validation_report: Json | null
        }
        Insert: {
          attempt_count?: number
          cinematic_ad_job_id?: string | null
          created_at?: string
          creative_angle?: string | null
          hashtags?: string[] | null
          id?: string
          log?: Json
          notes?: string | null
          pin_description?: string | null
          pin_title?: string | null
          pinterest_pin_id?: string | null
          pinterest_pin_url?: string | null
          product_id?: string | null
          product_image?: string | null
          product_name?: string | null
          product_slug: string
          product_url?: string | null
          published_at?: string | null
          scheduled_at: string
          scheduled_date: string
          skip_reason?: string | null
          status?: string
          updated_at?: string
          validation_report?: Json | null
        }
        Update: {
          attempt_count?: number
          cinematic_ad_job_id?: string | null
          created_at?: string
          creative_angle?: string | null
          hashtags?: string[] | null
          id?: string
          log?: Json
          notes?: string | null
          pin_description?: string | null
          pin_title?: string | null
          pinterest_pin_id?: string | null
          pinterest_pin_url?: string | null
          product_id?: string | null
          product_image?: string | null
          product_name?: string | null
          product_slug?: string
          product_url?: string | null
          published_at?: string | null
          scheduled_at?: string
          scheduled_date?: string
          skip_reason?: string | null
          status?: string
          updated_at?: string
          validation_report?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_autopilot_schedule_cinematic_ad_job_id_fkey"
            columns: ["cinematic_ad_job_id"]
            isOneToOne: false
            referencedRelation: "cinematic_ad_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinterest_autopilot_schedule_cinematic_ad_job_id_fkey"
            columns: ["cinematic_ad_job_id"]
            isOneToOne: false
            referencedRelation: "cinematic_ad_pipeline_tracking"
            referencedColumns: ["id"]
          },
        ]
      }
      pinterest_autopilot_settings: {
        Row: {
          enabled: boolean
          id: number
          max_pins_per_product_per_week: number
          min_quality_score: number
          mode: string
          preferred_category: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          id?: number
          max_pins_per_product_per_week?: number
          min_quality_score?: number
          mode?: string
          preferred_category?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          id?: number
          max_pins_per_product_per_week?: number
          min_quality_score?: number
          mode?: string
          preferred_category?: string | null
          updated_at?: string
          updated_by?: string | null
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
      pinterest_boards: {
        Row: {
          blacklist_reason: string | null
          board_created_at: string | null
          created_at: string
          follower_count: number | null
          id: string
          is_blacklisted: boolean
          is_sandbox: boolean
          last_seen_at: string
          last_validated_at: string | null
          last_validation_error: string | null
          last_validation_status: number | null
          name: string
          owner_username: string | null
          pin_count: number | null
          priority: number
          privacy: string | null
          production_verified: boolean
          production_verified_at: string | null
          style_affinity: string[]
          updated_at: string
        }
        Insert: {
          blacklist_reason?: string | null
          board_created_at?: string | null
          created_at?: string
          follower_count?: number | null
          id: string
          is_blacklisted?: boolean
          is_sandbox?: boolean
          last_seen_at?: string
          last_validated_at?: string | null
          last_validation_error?: string | null
          last_validation_status?: number | null
          name: string
          owner_username?: string | null
          pin_count?: number | null
          priority?: number
          privacy?: string | null
          production_verified?: boolean
          production_verified_at?: string | null
          style_affinity?: string[]
          updated_at?: string
        }
        Update: {
          blacklist_reason?: string | null
          board_created_at?: string | null
          created_at?: string
          follower_count?: number | null
          id?: string
          is_blacklisted?: boolean
          is_sandbox?: boolean
          last_seen_at?: string
          last_validated_at?: string | null
          last_validation_error?: string | null
          last_validation_status?: number | null
          name?: string
          owner_username?: string | null
          pin_count?: number | null
          priority?: number
          privacy?: string | null
          production_verified?: boolean
          production_verified_at?: string | null
          style_affinity?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      pinterest_capi_outbox: {
        Row: {
          attempts: number
          created_at: string
          currency: string | null
          custom_data: Json | null
          event_id: string
          event_name: string
          event_time: string
          id: string
          last_error: string | null
          niche_key: string | null
          pin_id: string | null
          pin_mode: string | null
          product_id: string | null
          sent_at: string | null
          status: string
          user_data: Json | null
          value: number | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          currency?: string | null
          custom_data?: Json | null
          event_id: string
          event_name: string
          event_time?: string
          id?: string
          last_error?: string | null
          niche_key?: string | null
          pin_id?: string | null
          pin_mode?: string | null
          product_id?: string | null
          sent_at?: string | null
          status?: string
          user_data?: Json | null
          value?: number | null
        }
        Update: {
          attempts?: number
          created_at?: string
          currency?: string | null
          custom_data?: Json | null
          event_id?: string
          event_name?: string
          event_time?: string
          id?: string
          last_error?: string | null
          niche_key?: string | null
          pin_id?: string | null
          pin_mode?: string | null
          product_id?: string | null
          sent_at?: string | null
          status?: string
          user_data?: Json | null
          value?: number | null
        }
        Relationships: []
      }
      pinterest_category_benchmarks: {
        Row: {
          avg_ctr: number
          avg_engagement: number
          avg_save_rate: number
          category_key: string
          computed_at: string
          id: string
          sample_size: number
          window_days: number
        }
        Insert: {
          avg_ctr?: number
          avg_engagement?: number
          avg_save_rate?: number
          category_key: string
          computed_at?: string
          id?: string
          sample_size?: number
          window_days: number
        }
        Update: {
          avg_ctr?: number
          avg_engagement?: number
          avg_save_rate?: number
          category_key?: string
          computed_at?: string
          id?: string
          sample_size?: number
          window_days?: number
        }
        Relationships: []
      }
      pinterest_category_rotation: {
        Row: {
          category: string | null
          created_at: string
          id: string
          last_published_at: string | null
          product_slug: string
          publish_count: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          last_published_at?: string | null
          product_slug: string
          publish_count?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          last_published_at?: string | null
          product_slug?: string
          publish_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      pinterest_cleanup_actions: {
        Row: {
          action: string
          executed_at: string
          executed_by: string | null
          id: string
          pin_id: string
          pre_action_snapshot: Json | null
          result: Json | null
        }
        Insert: {
          action: string
          executed_at?: string
          executed_by?: string | null
          id?: string
          pin_id: string
          pre_action_snapshot?: Json | null
          result?: Json | null
        }
        Update: {
          action?: string
          executed_at?: string
          executed_by?: string | null
          id?: string
          pin_id?: string
          pre_action_snapshot?: Json | null
          result?: Json | null
        }
        Relationships: []
      }
      pinterest_cleanup_audit: {
        Row: {
          audited_at: string
          composite_quality_score: number
          creative_category: string | null
          engagement_rate: number
          hook_repeat_count: number
          hook_text: string | null
          is_slideshow_spam: boolean
          pin_id: string
          reasons: Json
          recommendation: string
          slug: string | null
          slug_repeat_count: number
          thumbnail_phash: string | null
          visual_dup_count: number
        }
        Insert: {
          audited_at?: string
          composite_quality_score?: number
          creative_category?: string | null
          engagement_rate?: number
          hook_repeat_count?: number
          hook_text?: string | null
          is_slideshow_spam?: boolean
          pin_id: string
          reasons?: Json
          recommendation?: string
          slug?: string | null
          slug_repeat_count?: number
          thumbnail_phash?: string | null
          visual_dup_count?: number
        }
        Update: {
          audited_at?: string
          composite_quality_score?: number
          creative_category?: string | null
          engagement_rate?: number
          hook_repeat_count?: number
          hook_text?: string | null
          is_slideshow_spam?: boolean
          pin_id?: string
          reasons?: Json
          recommendation?: string
          slug?: string | null
          slug_repeat_count?: number
          thumbnail_phash?: string | null
          visual_dup_count?: number
        }
        Relationships: []
      }
      pinterest_cleanup_scan_sessions: {
        Row: {
          api_calls_used: number
          completed_at: string | null
          created_by: string | null
          cursor: string | null
          id: string
          last_error: string | null
          mode: string
          options: Json
          partial_summary: Json
          processed_count: number
          remaining_count: number | null
          started_at: string
          status: string
          total_estimate: number | null
          updated_at: string
        }
        Insert: {
          api_calls_used?: number
          completed_at?: string | null
          created_by?: string | null
          cursor?: string | null
          id?: string
          last_error?: string | null
          mode?: string
          options?: Json
          partial_summary?: Json
          processed_count?: number
          remaining_count?: number | null
          started_at?: string
          status?: string
          total_estimate?: number | null
          updated_at?: string
        }
        Update: {
          api_calls_used?: number
          completed_at?: string | null
          created_by?: string | null
          cursor?: string | null
          id?: string
          last_error?: string | null
          mode?: string
          options?: Json
          partial_summary?: Json
          processed_count?: number
          remaining_count?: number | null
          started_at?: string
          status?: string
          total_estimate?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      pinterest_competitor_pins: {
        Row: {
          description: string | null
          fetched_at: string
          id: string
          pattern_tags: string[] | null
          pin_external_id: string | null
          save_rate_est: number | null
          source_account: string | null
          title: string | null
          visual_hash: string | null
        }
        Insert: {
          description?: string | null
          fetched_at?: string
          id?: string
          pattern_tags?: string[] | null
          pin_external_id?: string | null
          save_rate_est?: number | null
          source_account?: string | null
          title?: string | null
          visual_hash?: string | null
        }
        Update: {
          description?: string | null
          fetched_at?: string
          id?: string
          pattern_tags?: string[] | null
          pin_external_id?: string | null
          save_rate_est?: number | null
          source_account?: string | null
          title?: string | null
          visual_hash?: string | null
        }
        Relationships: []
      }
      pinterest_compilation_themes: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          cta: string
          id: string
          max_products: number
          min_products: number
          title_template: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          cta?: string
          id?: string
          max_products?: number
          min_products?: number
          title_template: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          cta?: string
          id?: string
          max_products?: number
          min_products?: number
          title_template?: string
        }
        Relationships: []
      }
      pinterest_connection: {
        Row: {
          access_token: string | null
          account_id: string | null
          account_name: string | null
          board_count: number | null
          created_at: string
          id: string
          last_account_status: number | null
          last_boards_status: number | null
          last_error: string | null
          last_publish_at: string | null
          refresh_token: string | null
          scopes: string | null
          status: string
          token_created_at: string | null
          token_expires_at: string | null
          token_prefix: string | null
          token_sha256: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          board_count?: number | null
          created_at?: string
          id?: string
          last_account_status?: number | null
          last_boards_status?: number | null
          last_error?: string | null
          last_publish_at?: string | null
          refresh_token?: string | null
          scopes?: string | null
          status?: string
          token_created_at?: string | null
          token_expires_at?: string | null
          token_prefix?: string | null
          token_sha256?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          board_count?: number | null
          created_at?: string
          id?: string
          last_account_status?: number | null
          last_boards_status?: number | null
          last_error?: string | null
          last_publish_at?: string | null
          refresh_token?: string | null
          scopes?: string | null
          status?: string
          token_created_at?: string | null
          token_expires_at?: string | null
          token_prefix?: string | null
          token_sha256?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pinterest_creative_intents: {
        Row: {
          audience_intent: string | null
          color_palette: Json | null
          created_at: string
          cta_style: string | null
          emotional_angle: string | null
          hook_type: string | null
          id: string
          landing_slug: string | null
          lifestyle_category: string | null
          meta: Json | null
          niche_key: string | null
          pin_mode: string | null
          pin_queue_id: string | null
          product_id: string | null
          visual_style: string | null
        }
        Insert: {
          audience_intent?: string | null
          color_palette?: Json | null
          created_at?: string
          cta_style?: string | null
          emotional_angle?: string | null
          hook_type?: string | null
          id?: string
          landing_slug?: string | null
          lifestyle_category?: string | null
          meta?: Json | null
          niche_key?: string | null
          pin_mode?: string | null
          pin_queue_id?: string | null
          product_id?: string | null
          visual_style?: string | null
        }
        Update: {
          audience_intent?: string | null
          color_palette?: Json | null
          created_at?: string
          cta_style?: string | null
          emotional_angle?: string | null
          hook_type?: string | null
          id?: string
          landing_slug?: string | null
          lifestyle_category?: string | null
          meta?: Json | null
          niche_key?: string | null
          pin_mode?: string | null
          pin_queue_id?: string | null
          product_id?: string | null
          visual_style?: string | null
        }
        Relationships: []
      }
      pinterest_creative_pools: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          pool_type: string
          value: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          pool_type: string
          value: string
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          pool_type?: string
          value?: string
          weight?: number
        }
        Relationships: []
      }
      pinterest_creative_winners: {
        Row: {
          composite_score: number
          cta_phrase: string | null
          ga4_engaged_sessions: number
          ga4_sessions: number
          hook_category: string | null
          last_recomputed_at: string
          niche_key: string | null
          pattern_id: string | null
          pin_queue_id: string
          pinterest_impressions: number
          pinterest_outbound_clicks: number
          pinterest_saves: number
          profit_verdict: string | null
        }
        Insert: {
          composite_score?: number
          cta_phrase?: string | null
          ga4_engaged_sessions?: number
          ga4_sessions?: number
          hook_category?: string | null
          last_recomputed_at?: string
          niche_key?: string | null
          pattern_id?: string | null
          pin_queue_id: string
          pinterest_impressions?: number
          pinterest_outbound_clicks?: number
          pinterest_saves?: number
          profit_verdict?: string | null
        }
        Update: {
          composite_score?: number
          cta_phrase?: string | null
          ga4_engaged_sessions?: number
          ga4_sessions?: number
          hook_category?: string | null
          last_recomputed_at?: string
          niche_key?: string | null
          pattern_id?: string | null
          pin_queue_id?: string
          pinterest_impressions?: number
          pinterest_outbound_clicks?: number
          pinterest_saves?: number
          profit_verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_creative_winners_pin_queue_id_fkey"
            columns: ["pin_queue_id"]
            isOneToOne: true
            referencedRelation: "pinterest_pin_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      pinterest_debug_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          label: string | null
          minted_by: string | null
          minted_by_email: string | null
          token_hash: string
          used_at: string | null
          used_ip: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          label?: string | null
          minted_by?: string | null
          minted_by_email?: string | null
          token_hash: string
          used_at?: string | null
          used_ip?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          label?: string | null
          minted_by?: string | null
          minted_by_email?: string | null
          token_hash?: string
          used_at?: string | null
          used_ip?: string | null
        }
        Relationships: []
      }
      pinterest_domain_health: {
        Row: {
          checked_at: string
          domain: string
          http_status: number | null
          id: string
          latency_ms: number | null
          notes: string | null
          ok: boolean
          pinterest_reachable: boolean | null
        }
        Insert: {
          checked_at?: string
          domain: string
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          notes?: string | null
          ok?: boolean
          pinterest_reachable?: boolean | null
        }
        Update: {
          checked_at?: string
          domain?: string
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          notes?: string | null
          ok?: boolean
          pinterest_reachable?: boolean | null
        }
        Relationships: []
      }
      pinterest_evolution_log: {
        Row: {
          created_at: string
          decision_type: string
          id: string
          metrics: Json | null
          new_value: Json | null
          niche_key: string | null
          old_value: Json | null
          rationale: string | null
          target_dimension: string | null
        }
        Insert: {
          created_at?: string
          decision_type: string
          id?: string
          metrics?: Json | null
          new_value?: Json | null
          niche_key?: string | null
          old_value?: Json | null
          rationale?: string | null
          target_dimension?: string | null
        }
        Update: {
          created_at?: string
          decision_type?: string
          id?: string
          metrics?: Json | null
          new_value?: Json | null
          niche_key?: string | null
          old_value?: Json | null
          rationale?: string | null
          target_dimension?: string | null
        }
        Relationships: []
      }
      pinterest_funnel_events: {
        Row: {
          currency: string | null
          event_name: string
          id: string
          occurred_at: string
          pin_id: string | null
          product_slug: string | null
          session_key: string | null
          value: number | null
        }
        Insert: {
          currency?: string | null
          event_name: string
          id?: string
          occurred_at?: string
          pin_id?: string | null
          product_slug?: string | null
          session_key?: string | null
          value?: number | null
        }
        Update: {
          currency?: string | null
          event_name?: string
          id?: string
          occurred_at?: string
          pin_id?: string | null
          product_slug?: string | null
          session_key?: string | null
          value?: number | null
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
      pinterest_landing_templates: {
        Row: {
          aesthetic_tone: string | null
          body_blocks: Json | null
          color_atmosphere: string | null
          created_at: string
          cta_label: string
          cta_tone: string | null
          emotional_angle: string | null
          enabled: boolean
          hero_eyebrow: string | null
          hero_headline: string
          hero_subhead: string | null
          hook_type: string | null
          id: string
          lifestyle_image_keywords: Json | null
          meta: Json | null
          niche_key: string | null
          pin_mode: string | null
          recommended_collection_slug: string | null
          recommended_product_slug: string | null
          slug: string
          transformation_after: string | null
          transformation_before: string | null
          trust_block_variant: string | null
          updated_at: string
        }
        Insert: {
          aesthetic_tone?: string | null
          body_blocks?: Json | null
          color_atmosphere?: string | null
          created_at?: string
          cta_label?: string
          cta_tone?: string | null
          emotional_angle?: string | null
          enabled?: boolean
          hero_eyebrow?: string | null
          hero_headline: string
          hero_subhead?: string | null
          hook_type?: string | null
          id?: string
          lifestyle_image_keywords?: Json | null
          meta?: Json | null
          niche_key?: string | null
          pin_mode?: string | null
          recommended_collection_slug?: string | null
          recommended_product_slug?: string | null
          slug: string
          transformation_after?: string | null
          transformation_before?: string | null
          trust_block_variant?: string | null
          updated_at?: string
        }
        Update: {
          aesthetic_tone?: string | null
          body_blocks?: Json | null
          color_atmosphere?: string | null
          created_at?: string
          cta_label?: string
          cta_tone?: string | null
          emotional_angle?: string | null
          enabled?: boolean
          hero_eyebrow?: string | null
          hero_headline?: string
          hero_subhead?: string | null
          hook_type?: string | null
          id?: string
          lifestyle_image_keywords?: Json | null
          meta?: Json | null
          niche_key?: string | null
          pin_mode?: string | null
          recommended_collection_slug?: string | null
          recommended_product_slug?: string | null
          slug?: string
          transformation_after?: string | null
          transformation_before?: string | null
          trust_block_variant?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pinterest_lifestyle_scenes: {
        Row: {
          active: boolean
          backdrop_prompt: string
          created_at: string
          id: string
          music_mood: string
          overlay_hook: string
          scene_name: string
        }
        Insert: {
          active?: boolean
          backdrop_prompt: string
          created_at?: string
          id?: string
          music_mood?: string
          overlay_hook: string
          scene_name: string
        }
        Update: {
          active?: boolean
          backdrop_prompt?: string
          created_at?: string
          id?: string
          music_mood?: string
          overlay_hook?: string
          scene_name?: string
        }
        Relationships: []
      }
      pinterest_loser_blocklist: {
        Row: {
          asset_id: string | null
          blocked_until: string | null
          created_at: string
          hook_variant: string | null
          id: string
          product_slug: string | null
          reason: string | null
        }
        Insert: {
          asset_id?: string | null
          blocked_until?: string | null
          created_at?: string
          hook_variant?: string | null
          id?: string
          product_slug?: string | null
          reason?: string | null
        }
        Update: {
          asset_id?: string | null
          blocked_until?: string | null
          created_at?: string
          hook_variant?: string | null
          id?: string
          product_slug?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      pinterest_niche_coverage_snapshots: {
        Row: {
          created_at: string
          id: string
          niche: string
          pct: number
          product_count: number
          snapshot_date: string
          total_products: number
        }
        Insert: {
          created_at?: string
          id?: string
          niche: string
          pct?: number
          product_count?: number
          snapshot_date?: string
          total_products?: number
        }
        Update: {
          created_at?: string
          id?: string
          niche?: string
          pct?: number
          product_count?: number
          snapshot_date?: string
          total_products?: number
        }
        Relationships: []
      }
      pinterest_niche_rules: {
        Row: {
          created_at: string
          enabled: boolean
          forbid_all: string[]
          id: string
          niche: string
          notes: string | null
          primary_terms: string[]
          priority: number
          require_any: string[]
          rule_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          forbid_all?: string[]
          id?: string
          niche: string
          notes?: string | null
          primary_terms?: string[]
          priority?: number
          require_any?: string[]
          rule_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          forbid_all?: string[]
          id?: string
          niche?: string
          notes?: string | null
          primary_terms?: string[]
          priority?: number
          require_any?: string[]
          rule_id?: string
          updated_at?: string
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
      pinterest_pattern_versions: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          patch: Json
          pattern_id: string
          source: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          patch: Json
          pattern_id: string
          source: string
          version: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          patch?: Json
          pattern_id?: string
          source?: string
          version?: number
        }
        Relationships: []
      }
      pinterest_pattern_weights: {
        Row: {
          composite_score: number
          hook_category: string
          niche_key: string
          pattern_id: string
          sample_size: number
          updated_at: string
        }
        Insert: {
          composite_score?: number
          hook_category: string
          niche_key: string
          pattern_id: string
          sample_size?: number
          updated_at?: string
        }
        Update: {
          composite_score?: number
          hook_category?: string
          niche_key?: string
          pattern_id?: string
          sample_size?: number
          updated_at?: string
        }
        Relationships: []
      }
      pinterest_performance_signals: {
        Row: {
          add_to_cart: number
          backdrop_style: string | null
          board_id: string | null
          checkout: number
          created_at: string
          cta: string | null
          hook_category: string | null
          id: string
          impressions: number
          last_updated: string
          niche_key: string
          outbound: number
          pattern_id: string | null
          pin_mode: string | null
          product_category: string | null
          purchase: number
          revenue: number
          sample_size: number
          saves: number
          session_seconds: number
          sessions: number
        }
        Insert: {
          add_to_cart?: number
          backdrop_style?: string | null
          board_id?: string | null
          checkout?: number
          created_at?: string
          cta?: string | null
          hook_category?: string | null
          id?: string
          impressions?: number
          last_updated?: string
          niche_key: string
          outbound?: number
          pattern_id?: string | null
          pin_mode?: string | null
          product_category?: string | null
          purchase?: number
          revenue?: number
          sample_size?: number
          saves?: number
          session_seconds?: number
          sessions?: number
        }
        Update: {
          add_to_cart?: number
          backdrop_style?: string | null
          board_id?: string | null
          checkout?: number
          created_at?: string
          cta?: string | null
          hook_category?: string | null
          id?: string
          impressions?: number
          last_updated?: string
          niche_key?: string
          outbound?: number
          pattern_id?: string | null
          pin_mode?: string | null
          product_category?: string | null
          purchase?: number
          revenue?: number
          sample_size?: number
          saves?: number
          session_seconds?: number
          sessions?: number
        }
        Relationships: []
      }
      pinterest_pin_deletion_verifications: {
        Row: {
          created_at: string
          error: string | null
          http_status: number | null
          id: string
          pinterest_pin_id: string
          queue_id: string | null
          status: string
          verified_at: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          http_status?: number | null
          id?: string
          pinterest_pin_id: string
          queue_id?: string | null
          status: string
          verified_at?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          http_status?: number | null
          id?: string
          pinterest_pin_id?: string
          queue_id?: string | null
          status?: string
          verified_at?: string
        }
        Relationships: []
      }
      pinterest_pin_dimensions: {
        Row: {
          asset_id: string | null
          board_id: string | null
          category_key: string | null
          copy_variant: string | null
          cta_variant: string | null
          hook_variant: string | null
          niche_key: string | null
          pin_id: string
          product_slug: string | null
          published_at: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          board_id?: string | null
          category_key?: string | null
          copy_variant?: string | null
          cta_variant?: string | null
          hook_variant?: string | null
          niche_key?: string | null
          pin_id: string
          product_slug?: string | null
          published_at?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          board_id?: string | null
          category_key?: string | null
          copy_variant?: string | null
          cta_variant?: string | null
          hook_variant?: string | null
          niche_key?: string | null
          pin_id?: string
          product_slug?: string | null
          published_at?: string | null
          source?: string | null
          updated_at?: string
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
          approved_at: string | null
          approved_by: string | null
          board_id: string | null
          board_name: string
          cap_recovery_mode: boolean
          category_key: string | null
          content_type: string
          created_at: string
          creative_fingerprint: string | null
          destination_link: string
          error_message: string | null
          external_url: string | null
          hashtags: string[] | null
          hook_group: string | null
          id: string
          idempotency_key: string | null
          image_hash: string | null
          last_publish_error: string | null
          meta: Json | null
          overlay_text: string | null
          pin_description: string
          pin_external_id: string | null
          pin_image_phash: string | null
          pin_image_url: string | null
          pin_title: string
          pin_variant: string
          pin_verification_reason: string | null
          pin_verified: boolean | null
          pin_verified_at: string | null
          pinterest_pin_id: string | null
          posted_at: string | null
          priority: string
          product_id: string
          product_name: string
          product_slug: string
          profit_state: string | null
          publish_attempts: number
          publishing_started_at: string | null
          qa_reasons: string[]
          recovery_mode_publish: boolean
          recovery_trace: Json | null
          rejection_reason: string | null
          retries: number
          scheduled_at: string | null
          status: string
          updated_at: string
          us_audience_score: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          board_id?: string | null
          board_name?: string
          cap_recovery_mode?: boolean
          category_key?: string | null
          content_type?: string
          created_at?: string
          creative_fingerprint?: string | null
          destination_link: string
          error_message?: string | null
          external_url?: string | null
          hashtags?: string[] | null
          hook_group?: string | null
          id?: string
          idempotency_key?: string | null
          image_hash?: string | null
          last_publish_error?: string | null
          meta?: Json | null
          overlay_text?: string | null
          pin_description: string
          pin_external_id?: string | null
          pin_image_phash?: string | null
          pin_image_url?: string | null
          pin_title: string
          pin_variant: string
          pin_verification_reason?: string | null
          pin_verified?: boolean | null
          pin_verified_at?: string | null
          pinterest_pin_id?: string | null
          posted_at?: string | null
          priority?: string
          product_id: string
          product_name: string
          product_slug: string
          profit_state?: string | null
          publish_attempts?: number
          publishing_started_at?: string | null
          qa_reasons?: string[]
          recovery_mode_publish?: boolean
          recovery_trace?: Json | null
          rejection_reason?: string | null
          retries?: number
          scheduled_at?: string | null
          status?: string
          updated_at?: string
          us_audience_score?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          board_id?: string | null
          board_name?: string
          cap_recovery_mode?: boolean
          category_key?: string | null
          content_type?: string
          created_at?: string
          creative_fingerprint?: string | null
          destination_link?: string
          error_message?: string | null
          external_url?: string | null
          hashtags?: string[] | null
          hook_group?: string | null
          id?: string
          idempotency_key?: string | null
          image_hash?: string | null
          last_publish_error?: string | null
          meta?: Json | null
          overlay_text?: string | null
          pin_description?: string
          pin_external_id?: string | null
          pin_image_phash?: string | null
          pin_image_url?: string | null
          pin_title?: string
          pin_variant?: string
          pin_verification_reason?: string | null
          pin_verified?: boolean | null
          pin_verified_at?: string | null
          pinterest_pin_id?: string | null
          posted_at?: string | null
          priority?: string
          product_id?: string
          product_name?: string
          product_slug?: string
          profit_state?: string | null
          publish_attempts?: number
          publishing_started_at?: string | null
          qa_reasons?: string[]
          recovery_mode_publish?: boolean
          recovery_trace?: Json | null
          rejection_reason?: string | null
          retries?: number
          scheduled_at?: string | null
          status?: string
          updated_at?: string
          us_audience_score?: number | null
        }
        Relationships: []
      }
      pinterest_pin_verdicts: {
        Row: {
          action_taken: string | null
          ctr: number | null
          id: string
          impressions: number | null
          pin_id: string
          reason: string | null
          saves: number | null
          scored_at: string
          verdict: string
          winner_score: number | null
        }
        Insert: {
          action_taken?: string | null
          ctr?: number | null
          id?: string
          impressions?: number | null
          pin_id: string
          reason?: string | null
          saves?: number | null
          scored_at?: string
          verdict: string
          winner_score?: number | null
        }
        Update: {
          action_taken?: string | null
          ctr?: number | null
          id?: string
          impressions?: number | null
          pin_id?: string
          reason?: string | null
          saves?: number | null
          scored_at?: string
          verdict?: string
          winner_score?: number | null
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
      pinterest_posting_windows: {
        Row: {
          category_key: string
          computed_at: string
          hour_of_day: number
          id: string
          sample_size: number
          score: number
          timezone: string
        }
        Insert: {
          category_key: string
          computed_at?: string
          hour_of_day: number
          id?: string
          sample_size?: number
          score?: number
          timezone: string
        }
        Update: {
          category_key?: string
          computed_at?: string
          hour_of_day?: number
          id?: string
          sample_size?: number
          score?: number
          timezone?: string
        }
        Relationships: []
      }
      pinterest_publish_governor: {
        Row: {
          cooldown_minutes_per_product: number
          domain_healthy: boolean
          id: string
          max_per_board_per_day: number
          max_pins_per_hour: number
          trust_score: number
          updated_at: string
        }
        Insert: {
          cooldown_minutes_per_product?: number
          domain_healthy?: boolean
          id?: string
          max_per_board_per_day?: number
          max_pins_per_hour?: number
          trust_score?: number
          updated_at?: string
        }
        Update: {
          cooldown_minutes_per_product?: number
          domain_healthy?: boolean
          id?: string
          max_per_board_per_day?: number
          max_pins_per_hour?: number
          trust_score?: number
          updated_at?: string
        }
        Relationships: []
      }
      pinterest_publish_logs: {
        Row: {
          attempt: number
          board_id: string | null
          created_at: string
          destination_link: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          image_url: string | null
          pin_queue_id: string | null
          pin_title: string | null
          request_payload: Json | null
          response_payload: Json | null
          status: string
        }
        Insert: {
          attempt?: number
          board_id?: string | null
          created_at?: string
          destination_link?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          image_url?: string | null
          pin_queue_id?: string | null
          pin_title?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          status: string
        }
        Update: {
          attempt?: number
          board_id?: string | null
          created_at?: string
          destination_link?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          image_url?: string | null
          pin_queue_id?: string | null
          pin_title?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_publish_logs_pin_queue_id_fkey"
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
      pinterest_publish_verifications: {
        Row: {
          checked_at: string
          error: string | null
          id: string
          job_id: string | null
          pin_id: string | null
          pin_url: string | null
          remote_exists: boolean | null
          run_id: string | null
        }
        Insert: {
          checked_at?: string
          error?: string | null
          id?: string
          job_id?: string | null
          pin_id?: string | null
          pin_url?: string | null
          remote_exists?: boolean | null
          run_id?: string | null
        }
        Update: {
          checked_at?: string
          error?: string | null
          id?: string
          job_id?: string | null
          pin_id?: string | null
          pin_url?: string | null
          remote_exists?: boolean | null
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_publish_verifications_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pinterest_verification_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      pinterest_render_attempts: {
        Row: {
          attempt_no: number
          brief: Json | null
          created_at: string
          hook_category: string | null
          id: string
          niche_key: string | null
          pattern_id: string | null
          pin_mode: string | null
          pin_queue_id: string | null
          product_slug: string | null
          reasons: string[]
          rejected: boolean
          scores: Json
          total_score: number | null
        }
        Insert: {
          attempt_no?: number
          brief?: Json | null
          created_at?: string
          hook_category?: string | null
          id?: string
          niche_key?: string | null
          pattern_id?: string | null
          pin_mode?: string | null
          pin_queue_id?: string | null
          product_slug?: string | null
          reasons?: string[]
          rejected?: boolean
          scores?: Json
          total_score?: number | null
        }
        Update: {
          attempt_no?: number
          brief?: Json | null
          created_at?: string
          hook_category?: string | null
          id?: string
          niche_key?: string | null
          pattern_id?: string | null
          pin_mode?: string | null
          pin_queue_id?: string | null
          product_slug?: string | null
          reasons?: string[]
          rejected?: boolean
          scores?: Json
          total_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_render_attempts_pin_queue_id_fkey"
            columns: ["pin_queue_id"]
            isOneToOne: false
            referencedRelation: "pinterest_pin_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      pinterest_runtime_settings: {
        Row: {
          active_board_id: string | null
          active_board_name: string | null
          active_pinterest_connection_id: string | null
          auto_approve_queue: boolean
          daily_pin_cap: number
          deploy_verification_window_minutes: number
          deploy_verified_at: string | null
          domination_mode: boolean
          id: number
          last_deploy_verification: Json | null
          last_pin_external_id: string | null
          last_pin_external_url: string | null
          last_pin_publish_at: string | null
          last_pin_publish_error: string | null
          last_pin_published_at: string | null
          last_recovery_pin_at: string | null
          max_category_share_pct: number
          max_pins_per_product_per_day: number
          max_render_retries: number
          min_gap_minutes: number
          mode: string
          pacing_mode: string
          product_cooldown_hours: number
          production_publish_verified: boolean
          production_publish_verified_at: string | null
          production_trial_detected: boolean
          quality_threshold: number
          recovery_min_gap_hours: number
          safe_growth_mode: boolean
          scale_unlocked: boolean
          updated_at: string
          updated_by: string | null
          us_score_threshold: number
          verified_client_id_prefix: string | null
          warmup_until: string | null
        }
        Insert: {
          active_board_id?: string | null
          active_board_name?: string | null
          active_pinterest_connection_id?: string | null
          auto_approve_queue?: boolean
          daily_pin_cap?: number
          deploy_verification_window_minutes?: number
          deploy_verified_at?: string | null
          domination_mode?: boolean
          id?: number
          last_deploy_verification?: Json | null
          last_pin_external_id?: string | null
          last_pin_external_url?: string | null
          last_pin_publish_at?: string | null
          last_pin_publish_error?: string | null
          last_pin_published_at?: string | null
          last_recovery_pin_at?: string | null
          max_category_share_pct?: number
          max_pins_per_product_per_day?: number
          max_render_retries?: number
          min_gap_minutes?: number
          mode?: string
          pacing_mode?: string
          product_cooldown_hours?: number
          production_publish_verified?: boolean
          production_publish_verified_at?: string | null
          production_trial_detected?: boolean
          quality_threshold?: number
          recovery_min_gap_hours?: number
          safe_growth_mode?: boolean
          scale_unlocked?: boolean
          updated_at?: string
          updated_by?: string | null
          us_score_threshold?: number
          verified_client_id_prefix?: string | null
          warmup_until?: string | null
        }
        Update: {
          active_board_id?: string | null
          active_board_name?: string | null
          active_pinterest_connection_id?: string | null
          auto_approve_queue?: boolean
          daily_pin_cap?: number
          deploy_verification_window_minutes?: number
          deploy_verified_at?: string | null
          domination_mode?: boolean
          id?: number
          last_deploy_verification?: Json | null
          last_pin_external_id?: string | null
          last_pin_external_url?: string | null
          last_pin_publish_at?: string | null
          last_pin_publish_error?: string | null
          last_pin_published_at?: string | null
          last_recovery_pin_at?: string | null
          max_category_share_pct?: number
          max_pins_per_product_per_day?: number
          max_render_retries?: number
          min_gap_minutes?: number
          mode?: string
          pacing_mode?: string
          product_cooldown_hours?: number
          production_publish_verified?: boolean
          production_publish_verified_at?: string | null
          production_trial_detected?: boolean
          quality_threshold?: number
          recovery_min_gap_hours?: number
          safe_growth_mode?: boolean
          scale_unlocked?: boolean
          updated_at?: string
          updated_by?: string | null
          us_score_threshold?: number
          verified_client_id_prefix?: string | null
          warmup_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_runtime_settings_active_pinterest_connection_id_fkey"
            columns: ["active_pinterest_connection_id"]
            isOneToOne: false
            referencedRelation: "pinterest_connection"
            referencedColumns: ["id"]
          },
        ]
      }
      pinterest_strategy_state: {
        Row: {
          archetype_boosts: Json
          exploit_ratio: number
          hook_boosts: Json
          id: number
          last_evolved_at: string | null
          quality_threshold: number
          trend_modifiers: Json
          updated_at: string
        }
        Insert: {
          archetype_boosts?: Json
          exploit_ratio?: number
          hook_boosts?: Json
          id?: number
          last_evolved_at?: string | null
          quality_threshold?: number
          trend_modifiers?: Json
          updated_at?: string
        }
        Update: {
          archetype_boosts?: Json
          exploit_ratio?: number
          hook_boosts?: Json
          id?: number
          last_evolved_at?: string | null
          quality_threshold?: number
          trend_modifiers?: Json
          updated_at?: string
        }
        Relationships: []
      }
      pinterest_trend_signals: {
        Row: {
          aesthetic_tone: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          niche_key: string
          pin_mode: string | null
          rationale: string | null
          source: string
          starts_at: string
          trend_label: string
          updated_at: string
          weight: number
        }
        Insert: {
          aesthetic_tone?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          niche_key: string
          pin_mode?: string | null
          rationale?: string | null
          source?: string
          starts_at?: string
          trend_label: string
          updated_at?: string
          weight?: number
        }
        Update: {
          aesthetic_tone?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          niche_key?: string
          pin_mode?: string | null
          rationale?: string | null
          source?: string
          starts_at?: string
          trend_label?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      pinterest_verification_runs: {
        Row: {
          checked: number
          corrections: number
          dry_run: boolean
          finished_at: string | null
          id: string
          notes: string | null
          started_at: string
          triggered_by: string | null
        }
        Insert: {
          checked?: number
          corrections?: number
          dry_run?: boolean
          finished_at?: string | null
          id?: string
          notes?: string | null
          started_at?: string
          triggered_by?: string | null
        }
        Update: {
          checked?: number
          corrections?: number
          dry_run?: boolean
          finished_at?: string | null
          id?: string
          notes?: string | null
          started_at?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      pinterest_video_assets: {
        Row: {
          ai_content_score: number | null
          aspect_ratio: string | null
          content_hash: string
          country_target: string
          cover_attempts: number
          cover_generated: boolean
          cover_image_url: string | null
          cover_last_error: string | null
          cover_score: Json | null
          created_at: string
          detected_platform: string | null
          duration_seconds: number | null
          filename: string
          filesize_bytes: number | null
          hook_type: string
          id: string
          is_active: boolean
          key_frame_second: number
          language_target: string
          last_publish_at: string | null
          last_skip_reason: string | null
          mime_type: string | null
          next_retry_at: string | null
          pet_relevance_score: number | null
          product_slug: string
          public_url: string
          publish_count: number
          storage_bucket: string
          storage_path: string
          thumbnail_status: string
          thumbnail_url: string | null
          updated_at: string
          us_market_score: number | null
        }
        Insert: {
          ai_content_score?: number | null
          aspect_ratio?: string | null
          content_hash: string
          country_target?: string
          cover_attempts?: number
          cover_generated?: boolean
          cover_image_url?: string | null
          cover_last_error?: string | null
          cover_score?: Json | null
          created_at?: string
          detected_platform?: string | null
          duration_seconds?: number | null
          filename: string
          filesize_bytes?: number | null
          hook_type?: string
          id?: string
          is_active?: boolean
          key_frame_second?: number
          language_target?: string
          last_publish_at?: string | null
          last_skip_reason?: string | null
          mime_type?: string | null
          next_retry_at?: string | null
          pet_relevance_score?: number | null
          product_slug?: string
          public_url: string
          publish_count?: number
          storage_bucket: string
          storage_path: string
          thumbnail_status?: string
          thumbnail_url?: string | null
          updated_at?: string
          us_market_score?: number | null
        }
        Update: {
          ai_content_score?: number | null
          aspect_ratio?: string | null
          content_hash?: string
          country_target?: string
          cover_attempts?: number
          cover_generated?: boolean
          cover_image_url?: string | null
          cover_last_error?: string | null
          cover_score?: Json | null
          created_at?: string
          detected_platform?: string | null
          duration_seconds?: number | null
          filename?: string
          filesize_bytes?: number | null
          hook_type?: string
          id?: string
          is_active?: boolean
          key_frame_second?: number
          language_target?: string
          last_publish_at?: string | null
          last_skip_reason?: string | null
          mime_type?: string | null
          next_retry_at?: string | null
          pet_relevance_score?: number | null
          product_slug?: string
          public_url?: string
          publish_count?: number
          storage_bucket?: string
          storage_path?: string
          thumbnail_status?: string
          thumbnail_url?: string | null
          updated_at?: string
          us_market_score?: number | null
        }
        Relationships: []
      }
      pinterest_video_autopilot_settings: {
        Row: {
          enabled: boolean
          id: number
          max_per_day: number
          mode: string
          preferred_hook_types: string[]
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: number
          max_per_day?: number
          mode?: string
          preferred_hook_types?: string[]
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: number
          max_per_day?: number
          mode?: string
          preferred_hook_types?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      pinterest_video_copy_history: {
        Row: {
          asset_id: string
          clone_reason: string | null
          cloned_from_asset_id: string | null
          copy_variant: string | null
          cta_variant: string | null
          description: string
          hook_variant: string | null
          id: string
          title: string
          used_at: string
          variation_hash: string
        }
        Insert: {
          asset_id: string
          clone_reason?: string | null
          cloned_from_asset_id?: string | null
          copy_variant?: string | null
          cta_variant?: string | null
          description: string
          hook_variant?: string | null
          id?: string
          title: string
          used_at?: string
          variation_hash: string
        }
        Update: {
          asset_id?: string
          clone_reason?: string | null
          cloned_from_asset_id?: string | null
          copy_variant?: string | null
          cta_variant?: string | null
          description?: string
          hook_variant?: string | null
          id?: string
          title?: string
          used_at?: string
          variation_hash?: string
        }
        Relationships: []
      }
      pinterest_video_discovery_skips: {
        Row: {
          bucket: string
          created_at: string
          filename: string
          id: string
          path: string
          reason_code: string
          reason_detail: string | null
          size_bytes: number | null
          trace_id: string | null
        }
        Insert: {
          bucket: string
          created_at?: string
          filename: string
          id?: string
          path: string
          reason_code: string
          reason_detail?: string | null
          size_bytes?: number | null
          trace_id?: string | null
        }
        Update: {
          bucket?: string
          created_at?: string
          filename?: string
          id?: string
          path?: string
          reason_code?: string
          reason_detail?: string | null
          size_bytes?: number | null
          trace_id?: string | null
        }
        Relationships: []
      }
      pinterest_video_function_logs: {
        Row: {
          asset_id: string | null
          created_at: string
          function_name: string
          id: string
          level: string
          message: string
          payload: Json | null
          queue_id: string | null
          trace_id: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          function_name: string
          id?: string
          level?: string
          message: string
          payload?: Json | null
          queue_id?: string | null
          trace_id: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          function_name?: string
          id?: string
          level?: string
          message?: string
          payload?: Json | null
          queue_id?: string | null
          trace_id?: string
        }
        Relationships: []
      }
      pinterest_video_metrics: {
        Row: {
          asset_id: string | null
          ctr: number | null
          day: string
          engagement_rate: number | null
          fetched_at: string
          id: string
          impressions: number
          outbound_clicks: number
          pin_id: string
          pin_quality_score: number | null
          saves: number
        }
        Insert: {
          asset_id?: string | null
          ctr?: number | null
          day?: string
          engagement_rate?: number | null
          fetched_at?: string
          id?: string
          impressions?: number
          outbound_clicks?: number
          pin_id: string
          pin_quality_score?: number | null
          saves?: number
        }
        Update: {
          asset_id?: string | null
          ctr?: number | null
          day?: string
          engagement_rate?: number | null
          fetched_at?: string
          id?: string
          impressions?: number
          outbound_clicks?: number
          pin_id?: string
          pin_quality_score?: number | null
          saves?: number
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_video_metrics_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "pinterest_video_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinterest_video_metrics_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "pinterest_video_winners"
            referencedColumns: ["asset_id"]
          },
        ]
      }
      pinterest_video_publish_log: {
        Row: {
          created_at: string
          id: string
          payload: Json | null
          queue_id: string | null
          stage: string
          status: string
          trace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json | null
          queue_id?: string | null
          stage: string
          status: string
          trace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json | null
          queue_id?: string | null
          stage?: string
          status?: string
          trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_video_publish_log_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "pinterest_video_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      pinterest_video_queue: {
        Row: {
          archived: boolean
          asset_id: string
          attempt_count: number
          board_id: string | null
          copy_variant: string | null
          cover_frame_seconds: number | null
          created_at: string
          cta_text: string | null
          cta_variant: string | null
          description: string
          destination_url: string
          error_message: string | null
          external_url: string | null
          failure_payload: Json | null
          hashtags: string[]
          hook_variant: string | null
          id: string
          last_retry_at: string | null
          max_retries: number
          pin_id: string | null
          priority: number
          scheduled_at: string | null
          status: string
          title: string
          updated_at: string
          variation_hash: string
          winner_score: number | null
        }
        Insert: {
          archived?: boolean
          asset_id: string
          attempt_count?: number
          board_id?: string | null
          copy_variant?: string | null
          cover_frame_seconds?: number | null
          created_at?: string
          cta_text?: string | null
          cta_variant?: string | null
          description: string
          destination_url: string
          error_message?: string | null
          external_url?: string | null
          failure_payload?: Json | null
          hashtags?: string[]
          hook_variant?: string | null
          id?: string
          last_retry_at?: string | null
          max_retries?: number
          pin_id?: string | null
          priority?: number
          scheduled_at?: string | null
          status?: string
          title: string
          updated_at?: string
          variation_hash: string
          winner_score?: number | null
        }
        Update: {
          archived?: boolean
          asset_id?: string
          attempt_count?: number
          board_id?: string | null
          copy_variant?: string | null
          cover_frame_seconds?: number | null
          created_at?: string
          cta_text?: string | null
          cta_variant?: string | null
          description?: string
          destination_url?: string
          error_message?: string | null
          external_url?: string | null
          failure_payload?: Json | null
          hashtags?: string[]
          hook_variant?: string | null
          id?: string
          last_retry_at?: string | null
          max_retries?: number
          pin_id?: string | null
          priority?: number
          scheduled_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          variation_hash?: string
          winner_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_video_queue_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "pinterest_video_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinterest_video_queue_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "pinterest_video_winners"
            referencedColumns: ["asset_id"]
          },
        ]
      }
      pinterest_winner_dimensions: {
        Row: {
          composite_score: number
          computed_at: string
          conversion_rate: number | null
          hook_category: string | null
          id: string
          is_active: boolean
          niche_key: string
          outbound_rate: number | null
          pattern_id: string | null
          pin_mode: string | null
          revenue_per_impression: number | null
          sample_size: number
          save_rate: number | null
        }
        Insert: {
          composite_score?: number
          computed_at?: string
          conversion_rate?: number | null
          hook_category?: string | null
          id?: string
          is_active?: boolean
          niche_key: string
          outbound_rate?: number | null
          pattern_id?: string | null
          pin_mode?: string | null
          revenue_per_impression?: number | null
          sample_size?: number
          save_rate?: number | null
        }
        Update: {
          composite_score?: number
          computed_at?: string
          conversion_rate?: number | null
          hook_category?: string | null
          id?: string
          is_active?: boolean
          niche_key?: string
          outbound_rate?: number | null
          pattern_id?: string | null
          pin_mode?: string | null
          revenue_per_impression?: number | null
          sample_size?: number
          save_rate?: number | null
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
      product_creative_profiles: {
        Row: {
          briefs_version: number
          niche_key: string
          product_id: string
          profile: Json
          updated_at: string
        }
        Insert: {
          briefs_version?: number
          niche_key: string
          product_id: string
          profile: Json
          updated_at?: string
        }
        Update: {
          briefs_version?: number
          niche_key?: string
          product_id?: string
          profile?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_creative_profiles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_creative_profiles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
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
      product_priority: {
        Row: {
          created_at: string
          notes: string | null
          product_id: string
          tier: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          notes?: string | null
          product_id: string
          tier: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          notes?: string | null
          product_id?: string
          tier?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      profit_engine_decisions: {
        Row: {
          applied: boolean
          break_even_cpc: number | null
          clicks: number
          cpc: number | null
          ctr: number
          decided_at: string
          id: string
          impressions: number
          margin_usd: number | null
          pin_id: string
          product_id: string | null
          reason: string
          recommended_budget_delta_pct: number
          verdict: string
        }
        Insert: {
          applied?: boolean
          break_even_cpc?: number | null
          clicks?: number
          cpc?: number | null
          ctr?: number
          decided_at?: string
          id?: string
          impressions?: number
          margin_usd?: number | null
          pin_id: string
          product_id?: string | null
          reason: string
          recommended_budget_delta_pct?: number
          verdict: string
        }
        Update: {
          applied?: boolean
          break_even_cpc?: number | null
          clicks?: number
          cpc?: number | null
          ctr?: number
          decided_at?: string
          id?: string
          impressions?: number
          margin_usd?: number | null
          pin_id?: string
          product_id?: string | null
          reason?: string
          recommended_budget_delta_pct?: number
          verdict?: string
        }
        Relationships: []
      }
      profit_engine_function_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          function_name: string
          id: string
          level: string
          message: string | null
          payload: Json | null
          phase: string
          rows_processed: number | null
          scoring_source: string | null
          trace_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          function_name: string
          id?: string
          level?: string
          message?: string | null
          payload?: Json | null
          phase: string
          rows_processed?: number | null
          scoring_source?: string | null
          trace_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          function_name?: string
          id?: string
          level?: string
          message?: string | null
          payload?: Json | null
          phase?: string
          rows_processed?: number | null
          scoring_source?: string | null
          trace_id?: string
        }
        Relationships: []
      }
      profit_engine_settings: {
        Row: {
          blended_margin_pct: number
          created_at: string
          ctr_kill_pct: number
          ctr_scale_pct: number
          id: string
          min_impressions_kill: number
          scale_budget_pct: number
          singleton: boolean
          target_roas: number
          updated_at: string
        }
        Insert: {
          blended_margin_pct?: number
          created_at?: string
          ctr_kill_pct?: number
          ctr_scale_pct?: number
          id?: string
          min_impressions_kill?: number
          scale_budget_pct?: number
          singleton?: boolean
          target_roas?: number
          updated_at?: string
        }
        Update: {
          blended_margin_pct?: number
          created_at?: string
          ctr_kill_pct?: number
          ctr_scale_pct?: number
          id?: string
          min_impressions_kill?: number
          scale_budget_pct?: number
          singleton?: boolean
          target_roas?: number
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
      render_worker_heartbeats: {
        Row: {
          last_seen_at: string
          payload: Json
          queue_depth: number | null
          safe_mode: boolean | null
          supabase_host: string | null
          worker_id: string
        }
        Insert: {
          last_seen_at?: string
          payload?: Json
          queue_depth?: number | null
          safe_mode?: boolean | null
          supabase_host?: string | null
          worker_id: string
        }
        Update: {
          last_seen_at?: string
          payload?: Json
          queue_depth?: number | null
          safe_mode?: boolean | null
          supabase_host?: string | null
          worker_id?: string
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
      sessions: {
        Row: {
          bot_reason: string | null
          browser_family: string | null
          country: string | null
          device_confidence: number | null
          event_count: number
          first_touch_campaign: string | null
          first_touch_medium: string | null
          first_touch_source: string | null
          geo_quality: string | null
          in_app_browser: string | null
          is_bot: boolean | null
          landing_page: string | null
          last_seen_at: string
          last_touch_campaign: string | null
          last_touch_medium: string | null
          last_touch_source: string | null
          os_family: string | null
          page_view_count: number
          quality_class: string | null
          referrer: string | null
          session_id: string
          source_quality: string | null
          started_at: string
          traffic_quality_score: number | null
          user_agent: string | null
        }
        Insert: {
          bot_reason?: string | null
          browser_family?: string | null
          country?: string | null
          device_confidence?: number | null
          event_count?: number
          first_touch_campaign?: string | null
          first_touch_medium?: string | null
          first_touch_source?: string | null
          geo_quality?: string | null
          in_app_browser?: string | null
          is_bot?: boolean | null
          landing_page?: string | null
          last_seen_at?: string
          last_touch_campaign?: string | null
          last_touch_medium?: string | null
          last_touch_source?: string | null
          os_family?: string | null
          page_view_count?: number
          quality_class?: string | null
          referrer?: string | null
          session_id: string
          source_quality?: string | null
          started_at?: string
          traffic_quality_score?: number | null
          user_agent?: string | null
        }
        Update: {
          bot_reason?: string | null
          browser_family?: string | null
          country?: string | null
          device_confidence?: number | null
          event_count?: number
          first_touch_campaign?: string | null
          first_touch_medium?: string | null
          first_touch_source?: string | null
          geo_quality?: string | null
          in_app_browser?: string | null
          is_bot?: boolean | null
          landing_page?: string | null
          last_seen_at?: string
          last_touch_campaign?: string | null
          last_touch_medium?: string | null
          last_touch_source?: string | null
          os_family?: string | null
          page_view_count?: number
          quality_class?: string | null
          referrer?: string | null
          session_id?: string
          source_quality?: string | null
          started_at?: string
          traffic_quality_score?: number | null
          user_agent?: string | null
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
      smoke_test_runs: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string
          currency: string
          id: string
          metadata: Json
          mode: string
          payment_intent_id: string | null
          refund_id: string | null
          refunded_at: string | null
          session_url: string | null
          status: string
          stripe_session_id: string | null
          updated_at: string
          webhook_event_id: string | null
          webhook_received_at: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by: string
          currency?: string
          id?: string
          metadata?: Json
          mode: string
          payment_intent_id?: string | null
          refund_id?: string | null
          refunded_at?: string | null
          session_url?: string | null
          status?: string
          stripe_session_id?: string | null
          updated_at?: string
          webhook_event_id?: string | null
          webhook_received_at?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          metadata?: Json
          mode?: string
          payment_intent_id?: string | null
          refund_id?: string | null
          refunded_at?: string | null
          session_url?: string | null
          status?: string
          stripe_session_id?: string | null
          updated_at?: string
          webhook_event_id?: string | null
          webhook_received_at?: string | null
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
      stock_refresh_monitor_attempts: {
        Row: {
          attempt_number: number
          created_at: string
          duration_ms: number | null
          error_message: string | null
          error_stack: string | null
          id: string
          remaining: number | null
          run_id: string | null
          status: string
          synced_error: number | null
          synced_ok: number | null
          trace_id: string
        }
        Insert: {
          attempt_number: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          error_stack?: string | null
          id?: string
          remaining?: number | null
          run_id?: string | null
          status: string
          synced_error?: number | null
          synced_ok?: number | null
          trace_id: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          error_stack?: string | null
          id?: string
          remaining?: number | null
          run_id?: string | null
          status?: string
          synced_error?: number | null
          synced_ok?: number | null
          trace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_refresh_monitor_attempts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "stock_refresh_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_refresh_runs: {
        Row: {
          completed_at: string | null
          id: string
          label: string
          last_checked_at: string
          notes: Json | null
          notified_complete_at: string | null
          remaining: number
          started_at: string
          synced_error: number
          synced_ok: number
          total_initial: number
        }
        Insert: {
          completed_at?: string | null
          id?: string
          label?: string
          last_checked_at?: string
          notes?: Json | null
          notified_complete_at?: string | null
          remaining: number
          started_at?: string
          synced_error?: number
          synced_ok?: number
          total_initial: number
        }
        Update: {
          completed_at?: string | null
          id?: string
          label?: string
          last_checked_at?: string
          notes?: Json | null
          notified_complete_at?: string | null
          remaining?: number
          started_at?: string
          synced_error?: number
          synced_ok?: number
          total_initial?: number
        }
        Relationships: []
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
      tiktok_server_events: {
        Row: {
          created_at: string
          error: string | null
          event_id: string | null
          event_name: string
          id: string
          payload: Json | null
          pixel_id: string | null
          response_body: Json | null
          response_status: number | null
          status: string | null
          tiktok_code: number | null
          tiktok_message: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_id?: string | null
          event_name: string
          id?: string
          payload?: Json | null
          pixel_id?: string | null
          response_body?: Json | null
          response_status?: number | null
          status?: string | null
          tiktok_code?: number | null
          tiktok_message?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          event_id?: string | null
          event_name?: string
          id?: string
          payload?: Json | null
          pixel_id?: string | null
          response_body?: Json | null
          response_status?: number | null
          status?: string | null
          tiktok_code?: number | null
          tiktok_message?: string | null
        }
        Relationships: []
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
      tracking_anomalies: {
        Row: {
          anomaly_type: string
          created_at: string
          details: Json
          id: string
          resolved: boolean
          sample_event_ids: string[]
          session_id: string
          severity: string
          source_channel: string | null
          updated_at: string
        }
        Insert: {
          anomaly_type: string
          created_at?: string
          details?: Json
          id?: string
          resolved?: boolean
          sample_event_ids?: string[]
          session_id: string
          severity?: string
          source_channel?: string | null
          updated_at?: string
        }
        Update: {
          anomaly_type?: string
          created_at?: string
          details?: Json
          id?: string
          resolved?: boolean
          sample_event_ids?: string[]
          session_id?: string
          severity?: string
          source_channel?: string | null
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
      utm_session_log: {
        Row: {
          created_at: string
          fbclid: string | null
          gclid: string | null
          id: string
          is_internal: boolean
          landing_page: string | null
          missing_fields: string[]
          notes: string | null
          referrer: string | null
          session_id: string
          source_channel: string | null
          ttclid: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_id: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          validation_status: string
          visitor_id: string | null
        }
        Insert: {
          created_at?: string
          fbclid?: string | null
          gclid?: string | null
          id?: string
          is_internal?: boolean
          landing_page?: string | null
          missing_fields?: string[]
          notes?: string | null
          referrer?: string | null
          session_id: string
          source_channel?: string | null
          ttclid?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_id?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          validation_status?: string
          visitor_id?: string | null
        }
        Update: {
          created_at?: string
          fbclid?: string | null
          gclid?: string | null
          id?: string
          is_internal?: boolean
          landing_page?: string | null
          missing_fields?: string[]
          notes?: string | null
          referrer?: string | null
          session_id?: string
          source_channel?: string | null
          ttclid?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_id?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          validation_status?: string
          visitor_id?: string | null
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
          bot_suspect_reason: string | null
          browser: string | null
          city: string | null
          country: string | null
          created_at: string
          device_type: string | null
          geo_confidence: string
          id: string
          is_admin_path: boolean
          is_bot_suspect: boolean
          is_internal: boolean | null
          last_seen_at: string | null
          latitude: number | null
          longitude: number | null
          order_id: string | null
          order_value: number | null
          page_path: string | null
          product_category: string | null
          product_id: string | null
          product_name: string | null
          product_price: number | null
          product_quantity: number | null
          referrer: string | null
          referrer_category: string | null
          screen_height: number | null
          screen_width: number | null
          session_id: string
          traffic_quality: string
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_first_campaign: string | null
          utm_first_medium: string | null
          utm_first_source: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
        }
        Insert: {
          activity_type: string
          bot_suspect_reason?: string | null
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          geo_confidence?: string
          id?: string
          is_admin_path?: boolean
          is_bot_suspect?: boolean
          is_internal?: boolean | null
          last_seen_at?: string | null
          latitude?: number | null
          longitude?: number | null
          order_id?: string | null
          order_value?: number | null
          page_path?: string | null
          product_category?: string | null
          product_id?: string | null
          product_name?: string | null
          product_price?: number | null
          product_quantity?: number | null
          referrer?: string | null
          referrer_category?: string | null
          screen_height?: number | null
          screen_width?: number | null
          session_id: string
          traffic_quality?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_first_campaign?: string | null
          utm_first_medium?: string | null
          utm_first_source?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Update: {
          activity_type?: string
          bot_suspect_reason?: string | null
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          geo_confidence?: string
          id?: string
          is_admin_path?: boolean
          is_bot_suspect?: boolean
          is_internal?: boolean | null
          last_seen_at?: string | null
          latitude?: number | null
          longitude?: number | null
          order_id?: string | null
          order_value?: number | null
          page_path?: string | null
          product_category?: string | null
          product_id?: string | null
          product_name?: string | null
          product_price?: number | null
          product_quantity?: number | null
          referrer?: string | null
          referrer_category?: string | null
          screen_height?: number | null
          screen_width?: number | null
          session_id?: string
          traffic_quality?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_first_campaign?: string | null
          utm_first_medium?: string | null
          utm_first_source?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
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
      cinematic_ad_failure_breakdown: {
        Row: {
          category: string | null
          last_seen_at: string | null
          needs_review: number | null
          recoverable: number | null
          total: number | null
          unrecoverable: number | null
        }
        Relationships: []
      }
      cinematic_ad_pipeline_tracking: {
        Row: {
          approved_at: string | null
          id: string | null
          live_pin_url: string | null
          pinterest_publish_status: string | null
          pipeline_stage: string | null
          product_name: string | null
          product_slug: string | null
          publish_attempt_count: number | null
          publish_last_error: string | null
          publish_next_attempt_at: string | null
          publish_queue_status: string | null
          qa_score: number | null
          qa_threshold_applied: number | null
          render_complete_at: string | null
          render_started_at: string | null
          status: string | null
          updated_at: string | null
          validation_passed: boolean | null
        }
        Relationships: []
      }
      clean_channel_performance: {
        Row: {
          add_to_carts: number | null
          channel: string | null
          pdp_views: number | null
          purchases: number | null
          revenue: number | null
          sessions: number | null
          utm_medium: string | null
          utm_source: string | null
        }
        Relationships: []
      }
      clean_conversion_funnel: {
        Row: {
          atc_sessions: number | null
          checkout_sessions: number | null
          pdp_sessions: number | null
          purchase_sessions: number | null
          revenue: number | null
          sessions: number | null
        }
        Relationships: []
      }
      clean_product_performance: {
        Row: {
          add_to_carts: number | null
          product_category: string | null
          product_id: string | null
          product_name: string | null
          purchases: number | null
          revenue: number | null
          views: number | null
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
      clean_us_sessions: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          device_type: string | null
          duration_seconds: number | null
          event_count: number | null
          has_atc: boolean | null
          has_checkout: boolean | null
          has_pdp: boolean | null
          has_purchase: boolean | null
          referrer_category: string | null
          session_end: string | null
          session_id: string | null
          session_start: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_id: string | null
        }
        Relationships: []
      }
      pinterest_failure_analytics_v: {
        Row: {
          avg_score: number | null
          hook_category: string | null
          niche_key: string | null
          pattern_id: string | null
          reason: string | null
          rejected_count: number | null
          total_count: number | null
        }
        Relationships: []
      }
      pinterest_product_cooldown_v: {
        Row: {
          last_pushed_at: string | null
          product_slug: string | null
          pushes_last_30d: number | null
          slideshows_last_7d: number | null
          statics_last_7d: number | null
          videos_last_7d: number | null
        }
        Relationships: []
      }
      pinterest_retry_outcomes_v: {
        Row: {
          all_rejected: boolean | null
          any_accepted: boolean | null
          attempts_total: number | null
          final_score: number | null
          first_score: number | null
          hook_category: string | null
          niche_key: string | null
          pattern_id: string | null
          pin_queue_id: string | null
          score_delta: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_render_attempts_pin_queue_id_fkey"
            columns: ["pin_queue_id"]
            isOneToOne: false
            referencedRelation: "pinterest_pin_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      pinterest_score_distribution_v: {
        Row: {
          attempts: number | null
          avg_score: number | null
          band: string | null
          hook_category: string | null
          niche_key: string | null
          rejected_count: number | null
        }
        Relationships: []
      }
      pinterest_video_winners: {
        Row: {
          asset_id: string | null
          ctr_pct: number | null
          duration_seconds: number | null
          filename: string | null
          hook_type: string | null
          impressions: number | null
          outbound_clicks: number | null
          saves: number | null
        }
        Relationships: []
      }
      pinterest_winner_leaderboard_v: {
        Row: {
          board_name: string | null
          composite_score: number | null
          cta_phrase: string | null
          ctr_pct: number | null
          engagement_pct: number | null
          ga4_engaged_sessions: number | null
          ga4_sessions: number | null
          hook_category: string | null
          niche_key: string | null
          pattern_id: string | null
          pin_image_url: string | null
          pin_queue_id: string | null
          pinterest_impressions: number | null
          pinterest_outbound_clicks: number | null
          pinterest_saves: number | null
          posted_at: string | null
          product_name: string | null
          product_slug: string | null
          profit_verdict: string | null
          save_rate_pct: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pinterest_creative_winners_pin_queue_id_fkey"
            columns: ["pin_queue_id"]
            isOneToOne: true
            referencedRelation: "pinterest_pin_queue"
            referencedColumns: ["id"]
          },
        ]
      }
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
      us_attribution_events_v: {
        Row: {
          created_at: string | null
          event_type: string | null
          id: string | null
          meta: Json | null
          occurred_at: string | null
          page_path: string | null
          product_id: string | null
          product_slug: string | null
          quantity: number | null
          revenue_cents: number | null
          session_id: string | null
        }
        Relationships: []
      }
      us_channel_performance_daily_v: {
        Row: {
          add_to_cart: number | null
          channel: string | null
          created_at: string | null
          date: string | null
          id: string | null
          purchases: number | null
          revenue_cents: number | null
          sessions_excluded: number | null
          sessions_us: number | null
        }
        Insert: {
          add_to_cart?: number | null
          channel?: string | null
          created_at?: string | null
          date?: string | null
          id?: string | null
          purchases?: number | null
          revenue_cents?: number | null
          sessions_excluded?: number | null
          sessions_us?: number | null
        }
        Update: {
          add_to_cart?: number | null
          channel?: string | null
          created_at?: string | null
          date?: string | null
          id?: string | null
          purchases?: number | null
          revenue_cents?: number | null
          sessions_excluded?: number | null
          sessions_us?: number | null
        }
        Relationships: []
      }
      us_creative_performance_daily_v: {
        Row: {
          add_to_cart: number | null
          channel: string | null
          clicks: number | null
          content_item_id: string | null
          created_at: string | null
          date: string | null
          id: string | null
          impressions: number | null
          outbound_clicks: number | null
          purchases: number | null
          revenue_cents: number | null
          saves: number | null
          sessions_us: number | null
        }
        Insert: {
          add_to_cart?: number | null
          channel?: string | null
          clicks?: number | null
          content_item_id?: string | null
          created_at?: string | null
          date?: string | null
          id?: string | null
          impressions?: number | null
          outbound_clicks?: number | null
          purchases?: number | null
          revenue_cents?: number | null
          saves?: number | null
          sessions_us?: number | null
        }
        Update: {
          add_to_cart?: number | null
          channel?: string | null
          clicks?: number | null
          content_item_id?: string | null
          created_at?: string | null
          date?: string | null
          id?: string | null
          impressions?: number | null
          outbound_clicks?: number | null
          purchases?: number | null
          revenue_cents?: number | null
          saves?: number | null
          sessions_us?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gi_creative_performance_daily_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "gi_social_content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      us_mi_opportunities_v: {
        Row: {
          created_at: string | null
          evidence: Json | null
          id: string | null
          market: string | null
          score: number | null
          status: string | null
          title: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          evidence?: Json | null
          id?: string | null
          market?: string | null
          score?: number | null
          status?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          evidence?: Json | null
          id?: string | null
          market?: string | null
          score?: number | null
          status?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      us_mi_recommendations_v: {
        Row: {
          body: string | null
          category: string | null
          confidence: number | null
          created_at: string | null
          evidence_refs: Json | null
          id: string | null
          market: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          body?: string | null
          category?: string | null
          confidence?: number | null
          created_at?: string | null
          evidence_refs?: Json | null
          id?: string | null
          market?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: string | null
          category?: string | null
          confidence?: number | null
          created_at?: string | null
          evidence_refs?: Json | null
          id?: string | null
          market?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      us_mi_trends_v: {
        Row: {
          category: string | null
          created_at: string | null
          first_seen: string | null
          id: string | null
          last_seen: string | null
          market: string | null
          momentum: number | null
          notes: string | null
          score: number | null
          season: string | null
          source: string | null
          term: string | null
          trend_type: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          first_seen?: string | null
          id?: string | null
          last_seen?: string | null
          market?: string | null
          momentum?: number | null
          notes?: string | null
          score?: number | null
          season?: string | null
          source?: string | null
          term?: string | null
          trend_type?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          first_seen?: string | null
          id?: string | null
          last_seen?: string | null
          market?: string | null
          momentum?: number | null
          notes?: string | null
          score?: number | null
          season?: string | null
          source?: string | null
          term?: string | null
          trend_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      us_product_performance_daily_v: {
        Row: {
          add_to_cart: number | null
          checkouts: number | null
          created_at: string | null
          date: string | null
          id: string | null
          product_id: string | null
          product_slug: string | null
          purchases: number | null
          revenue_cents: number | null
          sessions_us: number | null
          views: number | null
        }
        Insert: {
          add_to_cart?: number | null
          checkouts?: number | null
          created_at?: string | null
          date?: string | null
          id?: string | null
          product_id?: string | null
          product_slug?: string | null
          purchases?: number | null
          revenue_cents?: number | null
          sessions_us?: number | null
          views?: number | null
        }
        Update: {
          add_to_cart?: number | null
          checkouts?: number | null
          created_at?: string | null
          date?: string | null
          id?: string | null
          product_id?: string | null
          product_slug?: string | null
          purchases?: number | null
          revenue_cents?: number | null
          sessions_us?: number | null
          views?: number | null
        }
        Relationships: []
      }
      us_traffic_sessions_v: {
        Row: {
          browser: string | null
          campaign: string | null
          city: string | null
          content: string | null
          country: string | null
          created_at: string | null
          device: string | null
          id: string | null
          is_bot: boolean | null
          is_internal: boolean | null
          is_us: boolean | null
          landing_page: string | null
          medium: string | null
          pin_id: string | null
          raw: Json | null
          region: string | null
          session_id: string | null
          source: string | null
          started_at: string | null
          term: string | null
          video_id: string | null
          visitor_id: string | null
        }
        Insert: {
          browser?: string | null
          campaign?: string | null
          city?: string | null
          content?: string | null
          country?: string | null
          created_at?: string | null
          device?: string | null
          id?: string | null
          is_bot?: boolean | null
          is_internal?: boolean | null
          is_us?: boolean | null
          landing_page?: string | null
          medium?: string | null
          pin_id?: string | null
          raw?: Json | null
          region?: string | null
          session_id?: string | null
          source?: string | null
          started_at?: string | null
          term?: string | null
          video_id?: string | null
          visitor_id?: string | null
        }
        Update: {
          browser?: string | null
          campaign?: string | null
          city?: string | null
          content?: string | null
          country?: string | null
          created_at?: string | null
          device?: string | null
          id?: string | null
          is_bot?: boolean | null
          is_internal?: boolean | null
          is_us?: boolean | null
          landing_page?: string | null
          medium?: string | null
          pin_id?: string | null
          raw?: Json | null
          region?: string | null
          session_id?: string | null
          source?: string | null
          started_at?: string | null
          term?: string | null
          video_id?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      bulk_reactivate_cat_dog_products: {
        Args: never
        Returns: {
          category_links_created: number
          details: Json
          reactivated_count: number
          skipped_no_image: number
          skipped_no_price: number
          skipped_other_species: number
          skipped_policy_unsafe: number
        }[]
      }
      check_heartbeat_liveness: { Args: never; Returns: Json }
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
      cinematic_autopilot_dashboard: { Args: never; Returns: Json }
      cinematic_autopilot_log_event: {
        Args: {
          _action_taken?: string
          _error_message?: string
          _event_type: string
          _job_id: string
          _new_status?: string
          _payload?: Json
          _previous_status?: string
          _recovery_result?: string
          _trace_id?: string
        }
        Returns: string
      }
      cinematic_queue_health: { Args: never; Returns: Json }
      cinematic_recover_stuck_jobs: { Args: never; Returns: Json }
      claim_cinematic_ad_job: {
        Args: { p_job_id?: string; p_worker_id: string }
        Returns: {
          cta_text: string
          hashtags: string[]
          hook_text: string
          hook_variant: string
          id: string
          music_url: string
          pin_description: string
          pin_destination_url: string
          pin_title: string
          preset: string
          previous_status: string
          product_id: string
          product_lock: Json
          product_name: string
          product_price: string
          product_slug: string
          render_attempts: number
          render_token: string
          render_worker_id: string
          scene_assets: Json
          subhook_text: string
          validation_report: Json
          vo_script: string
          vo_url: string
        }[]
      }
      cleanup_old_health_checks: { Args: never; Returns: undefined }
      cleanup_old_visitor_activity: { Args: never; Returns: undefined }
      cleanup_old_web_vitals: { Args: never; Returns: undefined }
      cleanup_preview_visitor_activity: { Args: never; Returns: number }
      clear_stale_cinematic_duplicates: { Args: never; Returns: Json }
      count_rejected_events: {
        Args: { window_hours?: number }
        Returns: {
          n: number
          reason: string
          source: string
        }[]
      }
      cta_ab_test_results: {
        Args: never
        Returns: {
          clicks: number
          ctr_pct: number
          impressions: number
          variant: string
        }[]
      }
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
      get_lp_funnel_report: {
        Args: {
          p_campaign?: string
          p_days?: number
          p_include_internal?: boolean
        }
        Returns: {
          add_to_cart: number
          atc_rate: number
          click_through_rate: number
          end_to_end_rate: number
          lp_cta_click: number
          lp_cta_impression: number
          lp_view: number
          pdp_rate: number
          pdp_view: number
          placement: string
          utm_campaign: string
        }[]
      }
      get_lp_funnel_report_range: {
        Args: {
          p_campaign?: string
          p_end: string
          p_include_internal?: boolean
          p_start: string
        }
        Returns: {
          add_to_cart: number
          atc_rate: number
          click_through_rate: number
          end_to_end_rate: number
          lp_cta_click: number
          lp_cta_impression: number
          lp_view: number
          pdp_rate: number
          pdp_view: number
          placement: string
          utm_campaign: string
        }[]
      }
      get_placement_overview:
        | {
            Args: { p_days?: number; p_include_internal?: boolean }
            Returns: {
              clicks: number
              ctr_pct: number
              first_click_wins: number
              impressions: number
              median_dwell_ms: number
              median_time_to_click_ms: number
              median_time_to_visible_ms: number
              p90_time_to_click_ms: number
              p90_time_to_visible_ms: number
              placement: string
            }[]
          }
        | {
            Args: {
              p_cohort?: string
              p_days?: number
              p_include_internal?: boolean
            }
            Returns: {
              clicks: number
              ctr_pct: number
              first_click_wins: number
              impressions: number
              intent_clicks: number
              intent_ctr_pct: number
              median_dwell_ms: number
              median_time_to_click_ms: number
              median_time_to_visible_ms: number
              misclick_rate_pct: number
              misclicks: number
              p90_time_to_click_ms: number
              p90_time_to_visible_ms: number
              placement: string
              repeat_click_rate_pct: number
              repeat_clicks: number
            }[]
          }
      get_placement_overview_by_cohort: {
        Args: { p_days?: number; p_include_internal?: boolean }
        Returns: {
          clicks: number
          cohort: string
          ctr_pct: number
          first_click_wins: number
          impressions: number
          median_time_to_click_ms: number
          median_time_to_visible_ms: number
          placement: string
        }[]
      }
      get_placement_overview_trend:
        | {
            Args: { p_days?: number; p_include_internal?: boolean }
            Returns: {
              clicks: number
              ctr_pct: number
              day: string
              impressions: number
              median_time_to_click_ms: number
              median_time_to_visible_ms: number
              placement: string
            }[]
          }
        | {
            Args: {
              p_cohort?: string
              p_days?: number
              p_include_internal?: boolean
            }
            Returns: {
              clicks: number
              ctr_pct: number
              day: string
              impressions: number
              median_time_to_click_ms: number
              median_time_to_visible_ms: number
              placement: string
            }[]
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
      get_returning_visitor_stats: {
        Args: { p_end: string; p_include_internal?: boolean; p_start: string }
        Returns: {
          new_visitors: number
          returning_visitor_pct: number
          returning_visitors: number
          total_sessions: number
          total_visitors: number
        }[]
      }
      get_tiktok_bio_split:
        | { Args: { p_window_days?: number }; Returns: Json }
        | {
            Args: { p_include_excluded?: boolean; p_window_days?: number }
            Returns: Json
          }
      get_tiktok_bot_detection_impact: {
        Args: { p_window_days?: number }
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
      get_tiktok_session_decision_log: {
        Args: {
          p_limit?: number
          p_only_excluded?: boolean
          p_session_id?: string
          p_window_days?: number
        }
        Returns: Json
      }
      get_tiktok_variant_kpis: {
        Args: { p_end: string; p_include_internal?: boolean; p_start: string }
        Returns: {
          add_to_carts: number
          arpv: number
          clicks: number
          ctr: number
          impressions: number
          pdp_views: number
          purchases: number
          revenue: number
          utm_campaign: string
          utm_content: string
          view_to_atc: number
          view_to_purchase: number
        }[]
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
      log_utm_session: {
        Args: {
          p_fbclid: string
          p_gclid: string
          p_is_internal?: boolean
          p_landing_page: string
          p_referrer: string
          p_session_id: string
          p_ttclid: string
          p_utm_campaign: string
          p_utm_content: string
          p_utm_id: string
          p_utm_medium: string
          p_utm_source: string
          p_utm_term: string
          p_visitor_id: string
        }
        Returns: string
      }
      pinterest_publish_health: { Args: never; Returns: Json }
      prune_pinterest_video_function_logs: { Args: never; Returns: undefined }
      purge_old_monitoring_runs: { Args: never; Returns: number }
      reset_cinematic_ad_job_to_queued: {
        Args: { p_job_id: string }
        Returns: {
          admin_review_reason: string | null
          ai_decisions: Json
          approval_confidence: number | null
          approval_source: string | null
          approved_at: string | null
          approved_by: string | null
          approved_for_render: boolean
          archive_reason: string | null
          archived_at: string | null
          auto_approval_blocked_reason: string | null
          auto_approval_reason: string | null
          auto_approved_at: string | null
          auto_publish: boolean
          autopilot: boolean
          autopilot_log: Json
          autopilot_threshold: number
          beat_signature: string | null
          beats_v5: Json | null
          camera_motion_score: number | null
          camera_style: string | null
          caption_variants: Json
          caption_visibility_score: number | null
          captions_visible: boolean | null
          category_match_passed: boolean | null
          cinematic_quality_score: number | null
          classification_confidence: number | null
          confidence_scores: Json
          content_type: string | null
          created_at: string
          created_by: string | null
          creative_category: string | null
          creative_quality_score: number | null
          creative_reject_reason: string | null
          cta_clarity_score: number | null
          cta_text: string | null
          cta_variants_meta: Json
          duplicate_risk_score: number
          duration_auto_trimmed: boolean
          duration_valid: boolean | null
          emotional_arc_score: number | null
          emotional_register: string | null
          engagement_pacing_score: number | null
          engine_version: string | null
          environment_flags: string[] | null
          error_message: string | null
          expected_impact: string | null
          failure_category: string | null
          first_frame_originality_score: number | null
          first3s_phash: string | null
          focal_bbox: Json | null
          has_vo: boolean | null
          hashtags: string[]
          hook_archetype: string | null
          hook_cooldown_until: string | null
          hook_strength_score: number | null
          hook_text: string | null
          hook_type: string | null
          hook_uniqueness_score: number | null
          hook_variant: string
          hook_variant_id: string | null
          hook_variants: Json | null
          hook_variants_meta: Json
          human_flags: Json | null
          human_presence_ratio: number | null
          humanization_seed: string | null
          id: string
          last_pinterest_attempt_at: string | null
          last_publish_queue_at: string | null
          media_hash: string | null
          media_type: string | null
          media_warnings: Json
          mobile_readability_score: number | null
          motion_diversity_score: number | null
          motion_entropy_score: number | null
          motion_exists: boolean | null
          motion_score: number | null
          music_track_id: string | null
          music_url: string | null
          needs_admin_review: boolean
          original_duration_seconds: number | null
          output_black_bars: boolean | null
          output_duration_seconds: number | null
          output_file_size_bytes: number | null
          output_height: number | null
          output_mp4_url: string | null
          output_thumbnail_url: string | null
          output_width: number | null
          overlay_text: string[] | null
          overlay_text_hash: string | null
          pacing_quality_score: number | null
          pin_description: string | null
          pin_destination_url: string | null
          pin_finished_at: string | null
          pin_last_error: string | null
          pin_publish_attempts: number | null
          pin_started_at: string | null
          pin_title: string | null
          pinterest_asset_id: string | null
          pinterest_live_pin_url: string | null
          pinterest_pin_id: string | null
          pinterest_pin_url: string | null
          pinterest_publish_attempts: number
          pinterest_publish_error: string | null
          pinterest_publish_status: string
          pinterest_uploaded_at: string | null
          pipeline_stage: string | null
          predicted_engagement: number | null
          prepared_at: string | null
          preset: string
          product_cooldown_until: string | null
          product_id: string | null
          product_ids: string[] | null
          product_lock: Json
          product_name: string | null
          product_price: string | null
          product_slug: string
          product_url: string | null
          publish_blocked_reason: string | null
          publish_window_bypass: boolean
          publishable_reason: string | null
          published_at: string | null
          pushed_to_pinterest_at: string | null
          qa_breakdown: Json | null
          qa_composite_score: number | null
          qa_decision_reason: string | null
          qa_preview_flags: Json | null
          qa_preview_url: string | null
          qa_report: Json
          qa_score: number | null
          qa_threshold_applied: number | null
          quarantined_assets: Json | null
          realism_consistency_score: number | null
          realism_score: number | null
          recommended_fix: string | null
          recoverable: boolean | null
          remote_exists: boolean | null
          render_attempts: number
          render_complete_at: string | null
          render_dispatched_at: string | null
          render_heartbeat_at: string | null
          render_log: Json
          render_mode: string | null
          render_priority_score: number | null
          render_queued_at: string | null
          render_started_at: string | null
          render_token: string | null
          render_worker_id: string | null
          rendered_at: string | null
          retention_likelihood_score: number | null
          risk_level: string | null
          root_cause: string | null
          scene_assets: Json
          scene_change_count: number | null
          scene_entropy_score: number | null
          scene_plan: Json | null
          scene_roles: Json | null
          scene_specs: Json
          scene_template: string | null
          scheduled_publish_at: string | null
          selected_cta_index: number
          selected_hook_index: number
          smart_retry_count: number
          status: string
          status_message: string | null
          storyboard: Json
          style_preset: string | null
          style_preset_key: string | null
          style_rejection_reason: string | null
          subhook_text: string | null
          text_safe_area_passed: boolean | null
          thumb_stop_score: number | null
          thumbnail_entropy_score: number | null
          thumbnail_phash: string | null
          trim_attempted_at: string | null
          trim_ffmpeg_exit_code: number | null
          trim_workflow_run_id: string | null
          ugc_authenticity_score: number | null
          uniqueness_score: number | null
          updated_at: string
          v4_reject_reasons: Json | null
          v5_reject_reasons: string[] | null
          validation_passed: boolean | null
          validation_report: Json | null
          validation_v4_passed: boolean | null
          validation_v5_passed: boolean | null
          variant_index: number
          variation_signature: string | null
          verified_at: string | null
          video_corrupted: boolean
          visual_energy_score: number | null
          visual_uniqueness_score: number | null
          vo_script: string | null
          vo_script_variants: Json
          vo_url: string | null
          voice_id: string
          voice_style: string | null
          voiceover_error: Json | null
          voiceover_last_attempt_at: string | null
          voiceover_script: Json | null
          voiceover_url: string | null
          voiceover_voice_id: string | null
          worker_last_error: string | null
        }
        SetofOptions: {
          from: "*"
          to: "cinematic_ad_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
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
