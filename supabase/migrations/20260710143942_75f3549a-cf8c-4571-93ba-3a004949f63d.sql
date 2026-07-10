
-- Wave 3 audit tables. Read/write only from edge functions; admins can inspect.

CREATE TABLE IF NOT EXISTS public.shopify_reconciliation (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_product_id UUID NOT NULL,
  shopify_gid TEXT NOT NULL,
  shopify_handle TEXT,
  source_slug TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  mismatches JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_snapshot JSONB,
  shopify_snapshot JSONB,
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_product_id)
);
GRANT SELECT ON public.shopify_reconciliation TO authenticated;
GRANT ALL ON public.shopify_reconciliation TO service_role;
ALTER TABLE public.shopify_reconciliation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins can read reconciliation" ON public.shopify_reconciliation
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.shopify_redirect_plan (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_product_id UUID NOT NULL,
  source_slug TEXT,
  intended_handle TEXT,
  actual_handle TEXT,
  old_url TEXT,
  new_url TEXT,
  exact_match BOOLEAN NOT NULL DEFAULT true,
  redirect_required BOOLEAN NOT NULL DEFAULT false,
  pinterest_reference_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_product_id)
);
GRANT SELECT ON public.shopify_redirect_plan TO authenticated;
GRANT ALL ON public.shopify_redirect_plan TO service_role;
ALTER TABLE public.shopify_redirect_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins can read redirect plan" ON public.shopify_redirect_plan
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.shopify_media_map (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_product_id UUID NOT NULL,
  shopify_product_gid TEXT NOT NULL,
  source_url TEXT NOT NULL,
  content_hash TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  alt_text TEXT,
  shopify_media_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  variant_key TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_product_id, source_url)
);
CREATE INDEX IF NOT EXISTS shopify_media_map_status_idx ON public.shopify_media_map(status);
GRANT SELECT ON public.shopify_media_map TO authenticated;
GRANT ALL ON public.shopify_media_map TO service_role;
ALTER TABLE public.shopify_media_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins can read media map" ON public.shopify_media_map
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.shopify_metafield_map (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_product_id UUID NOT NULL,
  shopify_product_gid TEXT NOT NULL,
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value_type TEXT NOT NULL,
  value TEXT,
  shopify_metafield_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_product_id, namespace, key)
);
GRANT SELECT ON public.shopify_metafield_map TO authenticated;
GRANT ALL ON public.shopify_metafield_map TO service_role;
ALTER TABLE public.shopify_metafield_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins can read metafield map" ON public.shopify_metafield_map
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.shopify_collection_map (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_name TEXT,
  handle TEXT NOT NULL,
  title TEXT NOT NULL,
  collection_type TEXT NOT NULL DEFAULT 'manual',
  seo_title TEXT,
  seo_description TEXT,
  shopify_collection_gid TEXT,
  membership_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'proposed',
  error TEXT,
  member_product_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_type, source_id)
);
GRANT SELECT ON public.shopify_collection_map TO authenticated;
GRANT ALL ON public.shopify_collection_map TO service_role;
ALTER TABLE public.shopify_collection_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins can read collection map" ON public.shopify_collection_map
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Seed W3 wave record if not already present with a fuller title.
UPDATE public.shopify_migration_waves
SET title = 'Media, Metafields, Collections & Catalog Certification',
    notes = COALESCE(notes,'') || ' | expanded scope: catalog reconciliation + media + metafields + collections + SEO/tag readiness + certification'
WHERE wave='W3' AND status='pending';
