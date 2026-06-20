
-- Revenue Engine V4: foundational tables + columns

CREATE TABLE IF NOT EXISTS public.pinterest_eligibility_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  product_slug text,
  eligible boolean NOT NULL,
  reason text,
  media_score integer,
  inventory integer,
  source text,
  details jsonb DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_eligibility_log TO authenticated;
GRANT ALL ON public.pinterest_eligibility_log TO service_role;
ALTER TABLE public.pinterest_eligibility_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read eligibility log" ON public.pinterest_eligibility_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service all eligibility log" ON public.pinterest_eligibility_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_eligibility_log_product ON public.pinterest_eligibility_log(product_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_eligibility_log_reason ON public.pinterest_eligibility_log(reason, checked_at DESC);

CREATE TABLE IF NOT EXISTS public.pinterest_replacement_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  winner_pin_id text,
  original_product_id uuid,
  replacement_product_id uuid,
  reason text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_replacement_log TO authenticated;
GRANT ALL ON public.pinterest_replacement_log TO service_role;
ALTER TABLE public.pinterest_replacement_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read replacement log" ON public.pinterest_replacement_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service all replacement log" ON public.pinterest_replacement_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pinterest_winner_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_pin_id text,
  category text,
  hook_category text,
  headline_pattern text,
  scene_pattern jsonb DEFAULT '{}'::jsonb,
  cta text,
  duration_s integer,
  composite_score numeric,
  uses_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_winner_templates TO authenticated;
GRANT ALL ON public.pinterest_winner_templates TO service_role;
ALTER TABLE public.pinterest_winner_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read winner templates" ON public.pinterest_winner_templates
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service all winner templates" ON public.pinterest_winner_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_winner_templates_category ON public.pinterest_winner_templates(category, composite_score DESC);

ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS creative_source_tier text;

ALTER TABLE public.pinterest_runtime_settings
  ADD COLUMN IF NOT EXISTS optimization_target text DEFAULT 'sales';
