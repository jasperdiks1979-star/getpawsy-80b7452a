
-- PEI-V1: Pinterest Evolution Intelligence (orchestration layer over PCIE-V2/PPE/AEC)

CREATE TABLE public.pei_creative_dna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id UUID,
  source_engine TEXT NOT NULL,
  product_id UUID,
  category TEXT,
  board_id TEXT,
  pinterest_pin_id TEXT,
  pin_url TEXT,
  destination_url TEXT,
  country TEXT DEFAULT 'US',
  season TEXT,
  genome JSONB NOT NULL DEFAULT '{}'::jsonb,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  image_url TEXT,
  image_fingerprint TEXT,
  published_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  retired_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pei_dna_pin ON public.pei_creative_dna(pinterest_pin_id);
CREATE INDEX idx_pei_dna_product ON public.pei_creative_dna(product_id);
CREATE INDEX idx_pei_dna_country_season ON public.pei_creative_dna(country, season);
CREATE INDEX idx_pei_dna_genome ON public.pei_creative_dna USING gin(genome);
GRANT SELECT ON public.pei_creative_dna TO authenticated;
GRANT ALL ON public.pei_creative_dna TO service_role;
ALTER TABLE public.pei_creative_dna ENABLE ROW LEVEL SECURITY;
CREATE POLICY pei_dna_admin_read ON public.pei_creative_dna FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY pei_dna_service ON public.pei_creative_dna FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.pei_attribution_rollup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dna_id UUID REFERENCES public.pei_creative_dna(id) ON DELETE CASCADE,
  pinterest_pin_id TEXT,
  impressions INT DEFAULT 0,
  closeups INT DEFAULT 0,
  saves INT DEFAULT 0,
  outbound_clicks INT DEFAULT 0,
  ctr NUMERIC,
  landing_views INT DEFAULT 0,
  add_to_cart INT DEFAULT 0,
  checkouts INT DEFAULT 0,
  purchases INT DEFAULT 0,
  revenue_cents BIGINT DEFAULT 0,
  profit_cents BIGINT DEFAULT 0,
  roas NUMERIC,
  ltv_pred_cents BIGINT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_days INT NOT NULL DEFAULT 14
);
CREATE INDEX idx_pei_attr_dna ON public.pei_attribution_rollup(dna_id);
GRANT SELECT ON public.pei_attribution_rollup TO authenticated;
GRANT ALL ON public.pei_attribution_rollup TO service_role;
ALTER TABLE public.pei_attribution_rollup ENABLE ROW LEVEL SECURITY;
CREATE POLICY pei_attr_admin ON public.pei_attribution_rollup FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY pei_attr_service ON public.pei_attribution_rollup FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.pei_gene_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gene_dimension TEXT NOT NULL,
  gene_value TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'US',
  season TEXT,
  alpha NUMERIC NOT NULL DEFAULT 1,
  beta NUMERIC NOT NULL DEFAULT 1,
  sample_count INT NOT NULL DEFAULT 0,
  revenue_cents BIGINT DEFAULT 0,
  profit_cents BIGINT DEFAULT 0,
  weight NUMERIC NOT NULL DEFAULT 1.0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(gene_dimension, gene_value, country, season)
);
CREATE INDEX idx_pei_gene_dim ON public.pei_gene_performance(gene_dimension, country);
GRANT SELECT ON public.pei_gene_performance TO authenticated;
GRANT ALL ON public.pei_gene_performance TO service_role;
ALTER TABLE public.pei_gene_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY pei_gene_admin ON public.pei_gene_performance FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY pei_gene_service ON public.pei_gene_performance FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.pei_weight_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  country TEXT NOT NULL DEFAULT 'US',
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT
);
GRANT SELECT ON public.pei_weight_snapshots TO authenticated;
GRANT ALL ON public.pei_weight_snapshots TO service_role;
ALTER TABLE public.pei_weight_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY pei_snap_admin ON public.pei_weight_snapshots FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY pei_snap_service ON public.pei_weight_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.pei_evolution_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  country TEXT NOT NULL DEFAULT 'US',
  top_performers JSONB DEFAULT '[]'::jsonb,
  worst_performers JSONB DEFAULT '[]'::jsonb,
  rising_genes JSONB DEFAULT '[]'::jsonb,
  declining_genes JSONB DEFAULT '[]'::jsonb,
  seasonal_shifts JSONB DEFAULT '[]'::jsonb,
  recommended_mutations JSONB DEFAULT '[]'::jsonb,
  revenue_insights JSONB DEFAULT '{}'::jsonb,
  profit_insights JSONB DEFAULT '{}'::jsonb,
  briefing TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(week_start, country)
);
GRANT SELECT ON public.pei_evolution_reports TO authenticated;
GRANT ALL ON public.pei_evolution_reports TO service_role;
ALTER TABLE public.pei_evolution_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY pei_report_admin ON public.pei_evolution_reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY pei_report_service ON public.pei_evolution_reports FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.pei_engine_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INT,
  records_processed INT DEFAULT 0,
  summary JSONB DEFAULT '{}'::jsonb,
  error TEXT
);
GRANT SELECT ON public.pei_engine_runs TO authenticated;
GRANT ALL ON public.pei_engine_runs TO service_role;
ALTER TABLE public.pei_engine_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY pei_runs_admin ON public.pei_engine_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY pei_runs_service ON public.pei_engine_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.pei_predicted_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID,
  country TEXT DEFAULT 'US',
  season TEXT,
  expected_ctr NUMERIC,
  expected_cvr NUMERIC,
  expected_roas NUMERIC,
  expected_revenue_cents BIGINT,
  expected_profit_cents BIGINT,
  recommended_genome JSONB DEFAULT '{}'::jsonb,
  rationale TEXT,
  reason_codes JSONB DEFAULT '[]'::jsonb,
  confidence NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pei_pred_country ON public.pei_predicted_winners(country, expected_roas DESC);
GRANT SELECT ON public.pei_predicted_winners TO authenticated;
GRANT ALL ON public.pei_predicted_winners TO service_role;
ALTER TABLE public.pei_predicted_winners ENABLE ROW LEVEL SECURITY;
CREATE POLICY pei_pred_admin ON public.pei_predicted_winners FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY pei_pred_service ON public.pei_predicted_winners FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Updated-at trigger
CREATE TRIGGER pei_dna_updated_at BEFORE UPDATE ON public.pei_creative_dna FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
