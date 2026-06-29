
-- Genesis V3.5 — Pinterest Audience Intelligence OS

CREATE TABLE IF NOT EXISTS public.gv35_audience_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  intent text,
  motivation text,
  pain_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  dream_outcome text,
  lifestyle text,
  budget_band text,
  shopping_behavior jsonb NOT NULL DEFAULT '{}'::jsonb,
  pinterest_behavior jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  visual_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  buying_triggers jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_emotion text,
  confidence numeric NOT NULL DEFAULT 0,
  evidence_count int NOT NULL DEFAULT 0,
  evidence_sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_cohort_key text,
  source_concept_key text,
  human_locked boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gv35_audience_personas TO authenticated;
GRANT ALL ON public.gv35_audience_personas TO service_role;
ALTER TABLE public.gv35_audience_personas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read personas" ON public.gv35_audience_personas FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "admins write personas" ON public.gv35_audience_personas FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gv35_product_audience_match (
  product_id uuid NOT NULL,
  persona_id uuid NOT NULL REFERENCES public.gv35_audience_personas(id) ON DELETE CASCADE,
  match_score numeric NOT NULL DEFAULT 0,
  save_prob numeric NOT NULL DEFAULT 0,
  click_prob numeric NOT NULL DEFAULT 0,
  purchase_prob numeric NOT NULL DEFAULT 0,
  buying_probability numeric NOT NULL DEFAULT 0,
  rank text NOT NULL DEFAULT 'emerging',
  expected_revenue numeric NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, persona_id)
);
GRANT SELECT ON public.gv35_product_audience_match TO authenticated;
GRANT ALL ON public.gv35_product_audience_match TO service_role;
ALTER TABLE public.gv35_product_audience_match ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read pam" ON public.gv35_product_audience_match FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "admins write pam" ON public.gv35_product_audience_match FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS gv35_pam_persona_idx ON public.gv35_product_audience_match (persona_id, match_score DESC);
CREATE INDEX IF NOT EXISTS gv35_pam_rank_idx ON public.gv35_product_audience_match (rank, match_score DESC);

CREATE TABLE IF NOT EXISTS public.gv35_audience_signals_daily (
  persona_id uuid NOT NULL REFERENCES public.gv35_audience_personas(id) ON DELETE CASCADE,
  day date NOT NULL,
  impressions int NOT NULL DEFAULT 0,
  saves int NOT NULL DEFAULT 0,
  outbound_clicks int NOT NULL DEFAULT 0,
  atc int NOT NULL DEFAULT 0,
  purchases int NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  expected_revenue numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (persona_id, day)
);
GRANT SELECT ON public.gv35_audience_signals_daily TO authenticated;
GRANT ALL ON public.gv35_audience_signals_daily TO service_role;
ALTER TABLE public.gv35_audience_signals_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read aud signals" ON public.gv35_audience_signals_daily FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "admins write aud signals" ON public.gv35_audience_signals_daily FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gv35_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.gv35_settings TO authenticated;
GRANT ALL ON public.gv35_settings TO service_role;
ALTER TABLE public.gv35_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gv35_settings" ON public.gv35_settings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "admins write gv35_settings" ON public.gv35_settings FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
INSERT INTO public.gv35_settings(key,value) VALUES ('audience_first_mode','{"enabled":false}'::jsonb) ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.pcie2_creatives ADD COLUMN IF NOT EXISTS persona_id uuid REFERENCES public.gv35_audience_personas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS pcie2_creatives_persona_idx ON public.pcie2_creatives (persona_id);

CREATE OR REPLACE VIEW public.gv35_audience_performance_v
WITH (security_invoker=on) AS
SELECT
  p.id AS persona_id, p.slug, p.name, p.primary_emotion, p.confidence,
  COALESCE(SUM(d.impressions),0)::bigint AS impressions_30d,
  COALESCE(SUM(d.saves),0)::bigint AS saves_30d,
  COALESCE(SUM(d.outbound_clicks),0)::bigint AS clicks_30d,
  COALESCE(SUM(d.atc),0)::bigint AS atc_30d,
  COALESCE(SUM(d.purchases),0)::bigint AS purchases_30d,
  COALESCE(SUM(d.revenue),0)::numeric AS revenue_30d,
  CASE WHEN COALESCE(SUM(d.impressions),0) > 0 THEN COALESCE(SUM(d.outbound_clicks),0)::numeric/SUM(d.impressions) ELSE 0 END AS ctr_30d,
  CASE WHEN COALESCE(SUM(d.outbound_clicks),0) > 0 THEN COALESCE(SUM(d.purchases),0)::numeric/SUM(d.outbound_clicks) ELSE 0 END AS cvr_30d
FROM public.gv35_audience_personas p
LEFT JOIN public.gv35_audience_signals_daily d
  ON d.persona_id = p.id AND d.day >= (CURRENT_DATE - INTERVAL '30 days')
WHERE p.status='active'
GROUP BY p.id, p.slug, p.name, p.primary_emotion, p.confidence;

CREATE OR REPLACE VIEW public.gv35_untapped_audiences_v
WITH (security_invoker=on) AS
SELECT
  p.id AS persona_id, p.slug, p.name, p.confidence,
  COALESCE((SELECT COUNT(*) FROM public.pcie2_creatives c WHERE c.persona_id = p.id),0) AS published_creatives,
  COALESCE((SELECT SUM(d.purchases) FROM public.gv35_audience_signals_daily d WHERE d.persona_id=p.id AND d.day >= CURRENT_DATE - INTERVAL '30 days'),0) AS purchases_30d
FROM public.gv35_audience_personas p
WHERE p.status='active'
ORDER BY published_creatives ASC, p.confidence DESC;

CREATE OR REPLACE VIEW public.gv35_audience_timing_v
WITH (security_invoker=on) AS
SELECT
  p.id AS persona_id, p.slug,
  EXTRACT(HOUR FROM (s.first_seen_at AT TIME ZONE 'America/New_York'))::int AS hour_et,
  COUNT(*)::bigint AS sessions,
  SUM(CASE WHEN s.order_id IS NOT NULL THEN 1 ELSE 0 END)::bigint AS purchases
FROM public.gv35_audience_personas p
LEFT JOIN public.canonical_sessions s
  ON s.first_seen_at >= now() - INTERVAL '30 days'
GROUP BY p.id, p.slug, hour_et;

GRANT SELECT ON public.gv35_audience_performance_v TO authenticated;
GRANT SELECT ON public.gv35_untapped_audiences_v TO authenticated;
GRANT SELECT ON public.gv35_audience_timing_v TO authenticated;
