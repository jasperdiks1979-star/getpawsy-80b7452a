
-- Growth Intelligence V1: scorecard, PDP health, campaign advisor

CREATE TABLE IF NOT EXISTS public.growth_daily_scorecard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL UNIQUE,
  growth_score numeric NOT NULL DEFAULT 0,
  revenue_score numeric NOT NULL DEFAULT 0,
  pinterest_score numeric NOT NULL DEFAULT 0,
  conversion_score numeric NOT NULL DEFAULT 0,
  seo_score numeric NOT NULL DEFAULT 0,
  inventory_score numeric NOT NULL DEFAULT 0,
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  alerts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.growth_daily_scorecard TO authenticated;
GRANT ALL ON public.growth_daily_scorecard TO service_role;
ALTER TABLE public.growth_daily_scorecard ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read scorecard" ON public.growth_daily_scorecard FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.pdp_health_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  audited_at timestamptz NOT NULL DEFAULT now(),
  overall_score numeric NOT NULL DEFAULT 0,
  title_score numeric NOT NULL DEFAULT 0,
  trust_score numeric NOT NULL DEFAULT 0,
  mobile_score numeric NOT NULL DEFAULT 0,
  urgency_score numeric NOT NULL DEFAULT 0,
  cta_score numeric NOT NULL DEFAULT 0,
  reviews_score numeric NOT NULL DEFAULT 0,
  faq_score numeric NOT NULL DEFAULT 0,
  seo_score numeric NOT NULL DEFAULT 0,
  cwv_score numeric NOT NULL DEFAULT 0,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pdp_audits_product ON public.pdp_health_audits(product_id, audited_at DESC);
CREATE INDEX IF NOT EXISTS idx_pdp_audits_score ON public.pdp_health_audits(overall_score);
GRANT SELECT ON public.pdp_health_audits TO authenticated;
GRANT ALL ON public.pdp_health_audits TO service_role;
ALTER TABLE public.pdp_health_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pdp audits" ON public.pdp_health_audits FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.pinterest_campaign_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at timestamptz NOT NULL DEFAULT now(),
  scope text NOT NULL,
  scope_id text,
  recommendation text NOT NULL,
  rationale text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_camp_reco_status ON public.pinterest_campaign_recommendations(status, generated_at DESC);
GRANT SELECT, UPDATE ON public.pinterest_campaign_recommendations TO authenticated;
GRANT ALL ON public.pinterest_campaign_recommendations TO service_role;
ALTER TABLE public.pinterest_campaign_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read camp reco" ON public.pinterest_campaign_recommendations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update camp reco" ON public.pinterest_campaign_recommendations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
