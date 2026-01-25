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
          click_count: number
          content: string
          created_at: string
          created_by: string | null
          id: string
          open_count: number
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
          click_count?: number
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          open_count?: number
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
          click_count?: number
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          open_count?: number
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
      product_reviews: {
        Row: {
          content: string | null
          created_at: string
          helpful_count: number
          id: string
          product_id: string
          rating: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          helpful_count?: number
          id?: string
          product_id: string
          rating: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          helpful_count?: number
          id?: string
          product_id?: string
          rating?: number
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
      products: {
        Row: {
          category: string | null
          cj_product_id: string | null
          compare_at_price: number | null
          cost_price: number | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          images: string[] | null
          is_active: boolean | null
          name: string
          price: number
          shipping_time: string | null
          sku: string | null
          slug: string | null
          stock: number | null
          supplier_name: string | null
          updated_at: string
          variants: Json | null
          weight: number | null
        }
        Insert: {
          category?: string | null
          cj_product_id?: string | null
          compare_at_price?: number | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          is_active?: boolean | null
          name: string
          price: number
          shipping_time?: string | null
          sku?: string | null
          slug?: string | null
          stock?: number | null
          supplier_name?: string | null
          updated_at?: string
          variants?: Json | null
          weight?: number | null
        }
        Update: {
          category?: string | null
          cj_product_id?: string | null
          compare_at_price?: number | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          is_active?: boolean | null
          name?: string
          price?: number
          shipping_time?: string | null
          sku?: string | null
          slug?: string | null
          stock?: number | null
          supplier_name?: string | null
          updated_at?: string
          variants?: Json | null
          weight?: number | null
        }
        Relationships: []
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
          city: string | null
          country: string | null
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          session_id: string
          updated_at: string
        }
        Insert: {
          activity_type: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          session_id: string
          updated_at?: string
        }
        Update: {
          activity_type?: string
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          session_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      products_public: {
        Row: {
          category: string | null
          cj_product_id: string | null
          compare_at_price: number | null
          created_at: string | null
          description: string | null
          id: string | null
          image_url: string | null
          images: string[] | null
          is_active: boolean | null
          name: string | null
          price: number | null
          shipping_time: string | null
          sku: string | null
          slug: string | null
          stock: number | null
          updated_at: string | null
          variants: Json | null
          weight: number | null
        }
        Insert: {
          category?: string | null
          cj_product_id?: string | null
          compare_at_price?: number | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          images?: string[] | null
          is_active?: boolean | null
          name?: string | null
          price?: number | null
          shipping_time?: string | null
          sku?: string | null
          slug?: string | null
          stock?: number | null
          updated_at?: string | null
          variants?: Json | null
          weight?: number | null
        }
        Update: {
          category?: string | null
          cj_product_id?: string | null
          compare_at_price?: number | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          images?: string[] | null
          is_active?: boolean | null
          name?: string | null
          price?: number | null
          shipping_time?: string | null
          sku?: string | null
          slug?: string | null
          stock?: number | null
          updated_at?: string | null
          variants?: Json | null
          weight?: number | null
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
      cleanup_old_visitor_activity: { Args: never; Returns: undefined }
      generate_product_slug: { Args: { product_name: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
