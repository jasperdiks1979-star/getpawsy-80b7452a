
CREATE TABLE IF NOT EXISTS public.aci_data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  category text NOT NULL,
  health text NOT NULL DEFAULT 'unknown',
  last_sync_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aci_data_sources TO authenticated;
GRANT ALL ON public.aci_data_sources TO service_role;
ALTER TABLE public.aci_data_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aci_data_sources admin read" ON public.aci_data_sources FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.aci_signals (
  id bigserial PRIMARY KEY,
  source_key text NOT NULL,
  kind text NOT NULL,
  entity_type text,
  entity_ref text,
  value_num double precision,
  value_text text,
  value_json jsonb,
  confidence double precision NOT NULL DEFAULT 1.0,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aci_signals_source_kind_idx ON public.aci_signals(source_key, kind, captured_at DESC);
CREATE INDEX IF NOT EXISTS aci_signals_entity_idx ON public.aci_signals(entity_type, entity_ref, captured_at DESC);
GRANT SELECT ON public.aci_signals TO authenticated;
GRANT ALL ON public.aci_signals TO service_role;
ALTER TABLE public.aci_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aci_signals admin read" ON public.aci_signals FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

INSERT INTO public.aci_data_sources(source_key, display_name, category) VALUES
  ('pinterest_pins','Pinterest Pins','pinterest'),
  ('pinterest_analytics','Pinterest Analytics','pinterest'),
  ('pinterest_ads','Pinterest Ads','pinterest'),
  ('ga4','GA4','analytics'),
  ('gsc','Google Search Console','seo'),
  ('gmc','Google Merchant Center','commerce'),
  ('cj','CJ Dropshipping','inventory'),
  ('orders','Orders','revenue'),
  ('inventory','Inventory','inventory'),
  ('products','Products','catalog'),
  ('product_media','Product Media','media'),
  ('cpe','Creative Production Engine','creative'),
  ('seo_engine','SEO Engine','seo'),
  ('blog_engine','Blog Engine','content'),
  ('prie','PRIE Brain','intelligence'),
  ('pga','PGA Snapshots','intelligence'),
  ('pec','Pinterest Enterprise','intelligence')
ON CONFLICT (source_key) DO NOTHING;
