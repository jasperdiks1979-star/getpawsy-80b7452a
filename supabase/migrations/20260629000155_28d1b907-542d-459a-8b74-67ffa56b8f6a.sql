
CREATE TABLE IF NOT EXISTS public.pre_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pre_settings TO authenticated;
GRANT ALL ON public.pre_settings TO service_role;
ALTER TABLE public.pre_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pre_settings_admin_read" ON public.pre_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "pre_settings_service_write" ON public.pre_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.pre_settings(key,value) VALUES
  ('enabled', 'true'::jsonb),
  ('min_overall_score', '95'::jsonb),
  ('min_product_visibility', '95'::jsonb),
  ('min_click_intent', '95'::jsonb),
  ('min_product_occupancy_pct', '20'::jsonb),
  ('vision_model', '"google/gemini-3-flash-preview"'::jsonb),
  ('hard_block', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pre_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  product_slug text,
  pin_queue_id uuid,
  pin_title text,
  pin_description text,
  pin_image_url text,
  destination_link text,
  product_visibility_score int,
  expectation_match_score int,
  species_match_ok boolean,
  detected_species text,
  use_case_match_ok boolean,
  detected_use_case text,
  promise_match_score int,
  visual_focus_score int,
  product_occupancy_pct int,
  click_intent_score int,
  landing_match_score int,
  shopping_match_score int,
  overall_score int,
  passed boolean NOT NULL DEFAULT false,
  blocking_reasons text[] NOT NULL DEFAULT '{}',
  regenerate_brief jsonb,
  raw_response jsonb,
  vision_model text,
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pre_evaluations_product_idx
  ON public.pre_evaluations(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pre_evaluations_queue_idx
  ON public.pre_evaluations(pin_queue_id);
CREATE INDEX IF NOT EXISTS pre_evaluations_passed_idx
  ON public.pre_evaluations(passed, created_at DESC);

GRANT SELECT ON public.pre_evaluations TO authenticated;
GRANT ALL ON public.pre_evaluations TO service_role;
ALTER TABLE public.pre_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pre_eval_admin_read" ON public.pre_evaluations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "pre_eval_service_write" ON public.pre_evaluations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
