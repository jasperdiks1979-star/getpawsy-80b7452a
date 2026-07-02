
-- Genesis V6: First Sales Accelerator tables
CREATE TABLE IF NOT EXISTS public.first_sales_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_kind TEXT NOT NULL, -- purchase|checkout_abandon|cart_abandon|bounce|visit
  session_id TEXT,
  visitor_id TEXT,
  product_id UUID,
  traffic_source TEXT,
  device TEXT,
  country TEXT,
  revenue NUMERIC,
  confidence NUMERIC,
  why TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  journey JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_fse_kind_time ON public.first_sales_events (event_kind, occurred_at DESC);
GRANT SELECT ON public.first_sales_events TO authenticated;
GRANT ALL ON public.first_sales_events TO service_role;
ALTER TABLE public.first_sales_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read first_sales_events" ON public.first_sales_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.first_sales_certifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  visitors INTEGER NOT NULL DEFAULT 0,
  qualified_visitors INTEGER NOT NULL DEFAULT 0,
  add_to_cart INTEGER NOT NULL DEFAULT 0,
  checkouts INTEGER NOT NULL DEFAULT 0,
  purchases INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC NOT NULL DEFAULT 0,
  gross_margin NUMERIC,
  net_margin NUMERIC,
  hero_product JSONB,
  top_leak JSONB,
  top_opportunity JSONB,
  top_recommendation JSONB,
  forecast JSONB,
  confidence NUMERIC,
  sha256 TEXT
);
GRANT SELECT ON public.first_sales_certifications TO authenticated;
GRANT ALL ON public.first_sales_certifications TO service_role;
ALTER TABLE public.first_sales_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read first_sales_certifications" ON public.first_sales_certifications
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
