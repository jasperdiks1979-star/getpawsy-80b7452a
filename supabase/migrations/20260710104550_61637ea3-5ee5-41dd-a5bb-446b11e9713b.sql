
-- ============================================================
-- Wave 1: Shopify Migration Framework
-- Read-only-first scaffolding. No data moved. No Shopify calls.
-- ============================================================

-- 1. shopify_id_map (canonical bridge)
CREATE TABLE public.shopify_id_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,          -- product, variant, collection, page, blog, article, redirect, customer, order
  source_id TEXT NOT NULL,            -- Supabase primary key as text
  source_handle TEXT,                 -- slug/handle in Supabase
  shopify_gid TEXT,                   -- gid://shopify/Product/1234567890
  shopify_numeric_id BIGINT,
  shopify_handle TEXT,
  wave TEXT NOT NULL DEFAULT 'W1',
  checksum TEXT,                      -- content hash for drift detection
  status TEXT NOT NULL DEFAULT 'pending', -- pending|planned|dry_run_ok|synced|error|conflict|skipped
  last_synced_at TIMESTAMPTZ,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id)
);
CREATE INDEX idx_shopify_id_map_status ON public.shopify_id_map (status);
CREATE INDEX idx_shopify_id_map_wave ON public.shopify_id_map (wave);
CREATE INDEX idx_shopify_id_map_shopify_gid ON public.shopify_id_map (shopify_gid);

GRANT SELECT ON public.shopify_id_map TO authenticated;
GRANT ALL ON public.shopify_id_map TO service_role;
ALTER TABLE public.shopify_id_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read shopify_id_map" ON public.shopify_id_map
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. shopify_migration_waves
CREATE TABLE public.shopify_migration_waves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wave TEXT NOT NULL UNIQUE,          -- W0..W14
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|in_progress|dry_run|awaiting_approval|completed|rolled_back|blocked
  dry_run BOOLEAN NOT NULL DEFAULT true,
  planned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  item_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  failure_count INT NOT NULL DEFAULT 0,
  approved_by UUID REFERENCES auth.users(id),
  notes TEXT,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.shopify_migration_waves TO authenticated;
GRANT ALL ON public.shopify_migration_waves TO service_role;
ALTER TABLE public.shopify_migration_waves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read shopify_migration_waves" ON public.shopify_migration_waves
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. shopify_migration_audit_log (append-only)
CREATE TABLE public.shopify_migration_audit_log (
  id BIGSERIAL PRIMARY KEY,
  wave TEXT NOT NULL,
  action TEXT NOT NULL,               -- plan|dry_run|execute|rollback|verify|conflict_resolved
  entity_type TEXT,
  entity_id TEXT,
  actor TEXT,                          -- 'system' | user_id | function name
  dry_run BOOLEAN NOT NULL DEFAULT true,
  request_payload JSONB,
  response_payload JSONB,
  http_status INT,
  duration_ms INT,
  ok BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shopify_audit_wave ON public.shopify_migration_audit_log (wave, created_at DESC);
CREATE INDEX idx_shopify_audit_entity ON public.shopify_migration_audit_log (entity_type, entity_id);

GRANT SELECT ON public.shopify_migration_audit_log TO authenticated;
GRANT ALL ON public.shopify_migration_audit_log TO service_role;
ALTER TABLE public.shopify_migration_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read shopify_audit_log" ON public.shopify_migration_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. shopify_field_mapping (declarative rules)
CREATE TABLE public.shopify_field_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity TEXT NOT NULL,        -- products, product_variants, collections, guides, blog_posts, static_pages
  source_field TEXT NOT NULL,
  shopify_entity TEXT NOT NULL,       -- Product, ProductVariant, Collection, Page, Article, Blog, Redirect
  shopify_field TEXT NOT NULL,
  transformer TEXT,                   -- name of pure fn: cents_to_decimal, markdown_to_html, slug_passthrough, etc
  required BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_entity, source_field, shopify_entity, shopify_field)
);

GRANT SELECT ON public.shopify_field_mapping TO authenticated;
GRANT ALL ON public.shopify_field_mapping TO service_role;
ALTER TABLE public.shopify_field_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read shopify_field_mapping" ON public.shopify_field_mapping
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. shopify_migration_conflicts
CREATE TABLE public.shopify_migration_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wave TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  conflict_type TEXT NOT NULL,        -- missing_required|schema_mismatch|handle_collision|policy_violation|checksum_drift
  source_value JSONB,
  target_value JSONB,
  severity TEXT NOT NULL DEFAULT 'warning', -- info|warning|blocker
  resolution TEXT,                    -- accept_source|accept_target|manual_edit|skip
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shopify_conflicts_wave ON public.shopify_migration_conflicts (wave, severity);
CREATE INDEX idx_shopify_conflicts_unresolved
  ON public.shopify_migration_conflicts (entity_type, entity_id)
  WHERE resolved_at IS NULL;

GRANT SELECT ON public.shopify_migration_conflicts TO authenticated;
GRANT ALL ON public.shopify_migration_conflicts TO service_role;
ALTER TABLE public.shopify_migration_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read shopify_conflicts" ON public.shopify_migration_conflicts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- updated_at triggers (reuse existing helper if present, else create)
CREATE OR REPLACE FUNCTION public.shopify_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_shopify_id_map_touch BEFORE UPDATE ON public.shopify_id_map
  FOR EACH ROW EXECUTE FUNCTION public.shopify_touch_updated_at();
CREATE TRIGGER trg_shopify_waves_touch BEFORE UPDATE ON public.shopify_migration_waves
  FOR EACH ROW EXECUTE FUNCTION public.shopify_touch_updated_at();
CREATE TRIGGER trg_shopify_field_mapping_touch BEFORE UPDATE ON public.shopify_field_mapping
  FOR EACH ROW EXECUTE FUNCTION public.shopify_touch_updated_at();
CREATE TRIGGER trg_shopify_conflicts_touch BEFORE UPDATE ON public.shopify_migration_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.shopify_touch_updated_at();

-- Seed wave roster (W0..W14)
INSERT INTO public.shopify_migration_waves (wave, title, status, dry_run, notes) VALUES
  ('W0','Owner Prerequisites','completed',true,'Approved. Dev store created; secrets deferred.'),
  ('W1','Migration Framework & Mapping Layer','in_progress',true,'This wave — scaffolding only.'),
  ('W2','Products + Variants','pending',true,'306 live products / 774 rows'),
  ('W3','Collections','pending',true,'5 collections'),
  ('W4','Content (Guides/Blog/Pages) + 301 Redirects','pending',true,'304 guides, 33 blogs, 14 pages'),
  ('W5','SEO Validation Gate','pending',true,'Redirect map + canonical parity'),
  ('W6','CJ Dropshipping App Reconnection','pending',true,'Official CJ Shopify app'),
  ('W7','Pinterest Enterprise Rewire','pending',true,'Repoint feed to Shopify'),
  ('W8','Analytics Rewire','pending',true,'GA4 + canonical analytics'),
  ('W9','Scandinavian Premium Theme','pending',true,'Optional theme copy'),
  ('W10','Historical Orders (Supabase-only, no migration)','pending',true,'Owner: NO customer migration'),
  ('W11','Enterprise Certification','pending',true,'PCIE2/PCIE3 + Growth Commander'),
  ('W12','Staging Cutover','pending',true,'legacy.getpawsy.pet subdomain'),
  ('W13','DNS Cutover / Go-Live','pending',true,'Deferred'),
  ('W14','14-Day Rollback Window','pending',true,'Deferred')
ON CONFLICT (wave) DO NOTHING;

-- Seed canonical field-mapping rules (deterministic, no AI)
INSERT INTO public.shopify_field_mapping (source_entity, source_field, shopify_entity, shopify_field, transformer, required, notes) VALUES
  -- Products
  ('products','title','Product','title','passthrough',true,NULL),
  ('products','slug','Product','handle','slug_passthrough',true,'must be URL-safe'),
  ('products','description','Product','descriptionHtml','markdown_to_html',true,NULL),
  ('products','vendor','Product','vendor','passthrough',false,'default = GetPawsy'),
  ('products','product_type','Product','productType','passthrough',false,NULL),
  ('products','tags','Product','tags','array_to_csv',false,NULL),
  ('products','seo_title','Product','seo.title','truncate_60',false,NULL),
  ('products','seo_description','Product','seo.description','truncate_160',false,NULL),
  ('products','status','Product','status','status_map',true,'active|draft|archived'),
  ('products','images','Product','media','image_array_to_media',false,NULL),
  -- Variants
  ('product_variants','sku','ProductVariant','sku','passthrough',true,NULL),
  ('product_variants','price_cents','ProductVariant','price','cents_to_decimal',true,NULL),
  ('product_variants','compare_at_cents','ProductVariant','compareAtPrice','cents_to_decimal',false,NULL),
  ('product_variants','weight_g','ProductVariant','inventoryItem.measurement.weight','grams_to_kg',false,NULL),
  ('product_variants','barcode','ProductVariant','barcode','passthrough',false,NULL),
  ('product_variants','inventory_quantity','ProductVariant','inventoryQuantity','integer',false,'per-location'),
  -- Collections
  ('collections','title','Collection','title','passthrough',true,NULL),
  ('collections','slug','Collection','handle','slug_passthrough',true,NULL),
  ('collections','description','Collection','descriptionHtml','markdown_to_html',false,NULL),
  ('collections','image_url','Collection','image','url_to_image',false,NULL),
  -- Content
  ('guides','title','Article','title','passthrough',true,'blog=guides'),
  ('guides','slug','Article','handle','slug_passthrough',true,NULL),
  ('guides','body_md','Article','body','markdown_to_html',true,NULL),
  ('guides','published_at','Article','publishedAt','iso8601',false,NULL),
  ('blog_posts','title','Article','title','passthrough',true,'blog=news'),
  ('blog_posts','slug','Article','handle','slug_passthrough',true,NULL),
  ('blog_posts','body_md','Article','body','markdown_to_html',true,NULL),
  ('static_pages','title','Page','title','passthrough',true,NULL),
  ('static_pages','slug','Page','handle','slug_passthrough',true,NULL),
  ('static_pages','body_md','Page','body','markdown_to_html',true,NULL),
  -- Redirects (SEO preservation)
  ('legacy_urls','from_path','Redirect','path','passthrough',true,NULL),
  ('legacy_urls','to_path','Redirect','target','passthrough',true,NULL)
ON CONFLICT (source_entity, source_field, shopify_entity, shopify_field) DO NOTHING;
