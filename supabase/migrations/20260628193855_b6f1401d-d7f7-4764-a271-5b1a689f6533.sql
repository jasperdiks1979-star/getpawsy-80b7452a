
ALTER TABLE public.pcie_v2_creatives
  ADD COLUMN IF NOT EXISTS parent_creative_id UUID REFERENCES public.pcie_v2_creatives(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS generation INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dna_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS pcie_v2_creatives_parent_idx ON public.pcie_v2_creatives(parent_creative_id);
CREATE INDEX IF NOT EXISTS pcie_v2_creatives_dna_idx ON public.pcie_v2_creatives(dna_fingerprint);

CREATE TABLE IF NOT EXISTS public.pcie_v2_creative_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id UUID NOT NULL REFERENCES public.pcie_v2_creatives(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  outbound_clicks INTEGER NOT NULL DEFAULT 0,
  ga4_sessions INTEGER NOT NULL DEFAULT 0,
  add_to_cart INTEGER NOT NULL DEFAULT 0,
  checkout INTEGER NOT NULL DEFAULT 0,
  purchases INTEGER NOT NULL DEFAULT 0,
  revenue_cents BIGINT NOT NULL DEFAULT 0,
  ad_spend_cents BIGINT NOT NULL DEFAULT 0,
  profit_cents BIGINT NOT NULL DEFAULT 0,
  aov_cents BIGINT NOT NULL DEFAULT 0,
  roas NUMERIC,
  cac_cents BIGINT,
  ctr NUMERIC GENERATED ALWAYS AS (CASE WHEN impressions > 0 THEN outbound_clicks::NUMERIC / impressions ELSE 0 END) STORED,
  save_rate NUMERIC GENERATED ALWAYS AS (CASE WHEN impressions > 0 THEN saves::NUMERIC / impressions ELSE 0 END) STORED,
  cvr NUMERIC GENERATED ALWAYS AS (CASE WHEN ga4_sessions > 0 THEN purchases::NUMERIC / ga4_sessions ELSE 0 END) STORED,
  cohort TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creative_id, window_start, window_end)
);
GRANT SELECT ON public.pcie_v2_creative_performance TO authenticated;
GRANT ALL ON public.pcie_v2_creative_performance TO service_role;
ALTER TABLE public.pcie_v2_creative_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read perf" ON public.pcie_v2_creative_performance FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service writes perf" ON public.pcie_v2_creative_performance FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS pcie_v2_creative_performance_creative_idx ON public.pcie_v2_creative_performance(creative_id);
CREATE INDEX IF NOT EXISTS pcie_v2_creative_performance_cohort_idx ON public.pcie_v2_creative_performance(cohort);

CREATE TABLE IF NOT EXISTS public.pcie_v2_creative_dna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id UUID NOT NULL UNIQUE REFERENCES public.pcie_v2_creatives(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  traits JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_slug TEXT,
  seed BIGINT,
  prompt_version TEXT,
  performance_score NUMERIC NOT NULL DEFAULT 0,
  cohort TEXT,
  generation INTEGER NOT NULL DEFAULT 0,
  parent_dna_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie_v2_creative_dna TO authenticated;
GRANT ALL ON public.pcie_v2_creative_dna TO service_role;
ALTER TABLE public.pcie_v2_creative_dna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read dna" ON public.pcie_v2_creative_dna FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service writes dna" ON public.pcie_v2_creative_dna FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS pcie_v2_creative_dna_fp_idx ON public.pcie_v2_creative_dna(fingerprint);
CREATE INDEX IF NOT EXISTS pcie_v2_creative_dna_perf_idx ON public.pcie_v2_creative_dna(performance_score DESC);

CREATE TABLE IF NOT EXISTS public.pcie_v2_evolution_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  creatives_evaluated INTEGER NOT NULL DEFAULT 0,
  winners_selected INTEGER NOT NULL DEFAULT 0,
  mutations_queued INTEGER NOT NULL DEFAULT 0,
  losers_retired INTEGER NOT NULL DEFAULT 0,
  weights_updated INTEGER NOT NULL DEFAULT 0,
  trends_detected INTEGER NOT NULL DEFAULT 0,
  learning_speed NUMERIC,
  mutation_rate NUMERIC,
  notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT
);
GRANT SELECT ON public.pcie_v2_evolution_runs TO authenticated;
GRANT ALL ON public.pcie_v2_evolution_runs TO service_role;
ALTER TABLE public.pcie_v2_evolution_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read evo runs" ON public.pcie_v2_evolution_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service writes evo runs" ON public.pcie_v2_evolution_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pcie_v2_evolution_lineage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.pcie_v2_evolution_runs(id) ON DELETE SET NULL,
  parent_creative_id UUID REFERENCES public.pcie_v2_creatives(id) ON DELETE SET NULL,
  child_creative_id UUID REFERENCES public.pcie_v2_creatives(id) ON DELETE SET NULL,
  inherited_traits JSONB NOT NULL DEFAULT '{}'::jsonb,
  mutated_traits JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_lift NUMERIC,
  rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie_v2_evolution_lineage TO authenticated;
GRANT ALL ON public.pcie_v2_evolution_lineage TO service_role;
ALTER TABLE public.pcie_v2_evolution_lineage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read lineage" ON public.pcie_v2_evolution_lineage FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service writes lineage" ON public.pcie_v2_evolution_lineage FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pcie_v2_retired_dna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  performance_score NUMERIC,
  sample_size INTEGER,
  traits JSONB NOT NULL DEFAULT '{}'::jsonb,
  retired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie_v2_retired_dna TO authenticated;
GRANT ALL ON public.pcie_v2_retired_dna TO service_role;
ALTER TABLE public.pcie_v2_retired_dna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read retired" ON public.pcie_v2_retired_dna FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service writes retired" ON public.pcie_v2_retired_dna FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pcie_v2_trend_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_type TEXT NOT NULL,
  trend_key TEXT NOT NULL,
  influence NUMERIC NOT NULL DEFAULT 1.0,
  confidence NUMERIC NOT NULL DEFAULT 0.5,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  source TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (trend_type, trend_key)
);
GRANT SELECT ON public.pcie_v2_trend_signals TO authenticated;
GRANT ALL ON public.pcie_v2_trend_signals TO service_role;
ALTER TABLE public.pcie_v2_trend_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read trends" ON public.pcie_v2_trend_signals FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service writes trends" ON public.pcie_v2_trend_signals FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pcie_v2_revenue_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL UNIQUE DEFAULT CURRENT_DATE,
  top_dna JSONB NOT NULL DEFAULT '[]'::jsonb,
  worst_dna JSONB NOT NULL DEFAULT '[]'::jsonb,
  winning_hooks JSONB NOT NULL DEFAULT '[]'::jsonb,
  winning_scenes JSONB NOT NULL DEFAULT '[]'::jsonb,
  winning_emotions JSONB NOT NULL DEFAULT '[]'::jsonb,
  winning_typography JSONB NOT NULL DEFAULT '[]'::jsonb,
  revenue_per_style JSONB NOT NULL DEFAULT '[]'::jsonb,
  ctr_per_hook JSONB NOT NULL DEFAULT '[]'::jsonb,
  roas_per_family JSONB NOT NULL DEFAULT '[]'::jsonb,
  evolution_graph JSONB NOT NULL DEFAULT '[]'::jsonb,
  learning_speed NUMERIC,
  mutation_rate NUMERIC,
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie_v2_revenue_snapshots TO authenticated;
GRANT ALL ON public.pcie_v2_revenue_snapshots TO service_role;
ALTER TABLE public.pcie_v2_revenue_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read snapshots" ON public.pcie_v2_revenue_snapshots FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service writes snapshots" ON public.pcie_v2_revenue_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_pcie_v2_perf_updated ON public.pcie_v2_creative_performance;
CREATE TRIGGER trg_pcie_v2_perf_updated BEFORE UPDATE ON public.pcie_v2_creative_performance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_pcie_v2_dna_updated ON public.pcie_v2_creative_dna;
CREATE TRIGGER trg_pcie_v2_dna_updated BEFORE UPDATE ON public.pcie_v2_creative_dna
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.pcie_v2_feature_flags (flag, enabled, notes) VALUES
  ('pcie_v2_revenue_learning', true, 'Phase 3: ingest pin/GA4/revenue metrics into creative performance'),
  ('pcie_v2_auto_evolution', true, 'Phase 3: nightly mutate winners + retire losers'),
  ('pcie_v2_trend_detection', true, 'Phase 3: detect seasonality/holiday/pet trends'),
  ('pcie_v2_auto_retirement', true, 'Phase 3: archive consistently underperforming DNA')
ON CONFLICT (flag) DO NOTHING;

INSERT INTO public.pcie_v2_config (key, value, description) VALUES
  ('winner_top_pct', '0.10'::jsonb, 'Top decile considered winners'),
  ('loser_bottom_pct', '0.10'::jsonb, 'Bottom decile considered losers'),
  ('min_impressions_for_judgment', '500'::jsonb, 'Minimum impressions before a creative is judged'),
  ('mutations_per_winner', '3'::jsonb, 'Children generated per winner nightly'),
  ('learning_speed_default', '0.15'::jsonb, 'EMA alpha for weight updates'),
  ('mutation_rate_default', '0.25'::jsonb, 'Fraction of traits mutated per child'),
  ('revenue_signal_weights', '{"ctr":0.15,"save_rate":0.10,"outbound_ctr":0.15,"atc_rate":0.15,"checkout_rate":0.10,"purchase_rate":0.15,"revenue":0.10,"roas":0.10}'::jsonb, 'Composite score weights for performance ranking')
ON CONFLICT (key) DO NOTHING;
