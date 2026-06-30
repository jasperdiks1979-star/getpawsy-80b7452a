
CREATE TABLE IF NOT EXISTS public.gv6_first_sale_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL UNIQUE,
  product_slug text,
  product_name text,
  fsps integer NOT NULL DEFAULT 0,
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  rank integer,
  mode text NOT NULL DEFAULT 'exploration',
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gv6_fsps_desc ON public.gv6_first_sale_scores(fsps DESC);
GRANT SELECT ON public.gv6_first_sale_scores TO authenticated;
GRANT ALL ON public.gv6_first_sale_scores TO service_role;
ALTER TABLE public.gv6_first_sale_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read gv6 fsps" ON public.gv6_first_sale_scores;
CREATE POLICY "Admins read gv6 fsps" ON public.gv6_first_sale_scores FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.gv6_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status text NOT NULL DEFAULT 'running',
  scored_count integer NOT NULL DEFAULT 0,
  reprioritized_count integer NOT NULL DEFAULT 0,
  top_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_hours_to_first_sale numeric,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error text
);
GRANT SELECT ON public.gv6_runs TO authenticated;
GRANT ALL ON public.gv6_runs TO service_role;
ALTER TABLE public.gv6_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read gv6 runs" ON public.gv6_runs;
CREATE POLICY "Admins read gv6 runs" ON public.gv6_runs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
