
-- Genesis V3 Phase 2: Product Intelligence Engine
CREATE TABLE IF NOT EXISTS public.gv3_pi_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'queued',
  products_targeted int NOT NULL DEFAULT 0,
  products_scored int NOT NULL DEFAULT 0,
  recommendations_written int NOT NULL DEFAULT 0,
  window_days int NOT NULL DEFAULT 30,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gv3_pi_runs TO authenticated;
GRANT ALL ON public.gv3_pi_runs TO service_role;
ALTER TABLE public.gv3_pi_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gv3_pi_runs admin read" ON public.gv3_pi_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gv3_pi_scores (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.gv3_pi_runs(id) ON DELETE SET NULL,
  window_days int NOT NULL DEFAULT 30,
  sessions int NOT NULL DEFAULT 0,
  product_views int NOT NULL DEFAULT 0,
  add_to_carts int NOT NULL DEFAULT 0,
  checkouts int NOT NULL DEFAULT 0,
  purchases int NOT NULL DEFAULT 0,
  revenue_cents bigint NOT NULL DEFAULT 0,
  aov_cents bigint NOT NULL DEFAULT 0,
  traffic_score numeric NOT NULL DEFAULT 0,
  view_score numeric NOT NULL DEFAULT 0,
  atc_score numeric NOT NULL DEFAULT 0,
  checkout_score numeric NOT NULL DEFAULT 0,
  purchase_score numeric NOT NULL DEFAULT 0,
  revenue_score numeric NOT NULL DEFAULT 0,
  aov_score numeric NOT NULL DEFAULT 0,
  profit_score numeric NOT NULL DEFAULT 0,
  pinterest_score numeric NOT NULL DEFAULT 0,
  tiktok_score numeric NOT NULL DEFAULT 0,
  seo_score numeric NOT NULL DEFAULT 0,
  cro_risk_score numeric NOT NULL DEFAULT 0,
  confidence_score numeric NOT NULL DEFAULT 0,
  overall_score numeric NOT NULL DEFAULT 0,
  classification text,
  reason text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_scored_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gv3_pi_scores TO authenticated;
GRANT ALL ON public.gv3_pi_scores TO service_role;
ALTER TABLE public.gv3_pi_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gv3_pi_scores admin read" ON public.gv3_pi_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_gv3_pi_scores_overall ON public.gv3_pi_scores(overall_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_gv3_pi_scores_class ON public.gv3_pi_scores(classification);

CREATE TABLE IF NOT EXISTS public.gv3_pi_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.gv3_pi_runs(id) ON DELETE SET NULL,
  classification text NOT NULL,
  recommended_action text NOT NULL,
  reason text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority int NOT NULL DEFAULT 5,
  expected_impact text,
  confidence numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gv3_pi_recommendations TO authenticated;
GRANT ALL ON public.gv3_pi_recommendations TO service_role;
ALTER TABLE public.gv3_pi_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gv3_pi_recs admin read" ON public.gv3_pi_recommendations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_gv3_pi_recs_product ON public.gv3_pi_recommendations(product_id);
CREATE INDEX IF NOT EXISTS idx_gv3_pi_recs_priority ON public.gv3_pi_recommendations(priority DESC, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gv3_pi_recs_run_product_class ON public.gv3_pi_recommendations(run_id, product_id, classification);

CREATE TRIGGER trg_gv3_pi_scores_updated BEFORE UPDATE ON public.gv3_pi_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
