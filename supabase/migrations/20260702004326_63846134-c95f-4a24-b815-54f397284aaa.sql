
CREATE TABLE public.genesis_truth_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  domain TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  canonical_source TEXT,
  formula TEXT,
  unit TEXT,
  consumers JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC NOT NULL DEFAULT 0,
  last_validated_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_truth_metrics TO authenticated;
GRANT ALL ON public.genesis_truth_metrics TO service_role;
ALTER TABLE public.genesis_truth_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read truth metrics" ON public.genesis_truth_metrics FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "service write truth metrics" ON public.genesis_truth_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.genesis_truth_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key TEXT NOT NULL,
  source_a TEXT NOT NULL,
  source_b TEXT NOT NULL,
  value_a NUMERIC,
  value_b NUMERIC,
  delta_pct NUMERIC,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  explanation TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution TEXT
);
GRANT SELECT ON public.genesis_truth_conflicts TO authenticated;
GRANT ALL ON public.genesis_truth_conflicts TO service_role;
ALTER TABLE public.genesis_truth_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read truth conflicts" ON public.genesis_truth_conflicts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "service write truth conflicts" ON public.genesis_truth_conflicts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.genesis_truth_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_metrics INT NOT NULL DEFAULT 0,
  canonical_count INT NOT NULL DEFAULT 0,
  derived_count INT NOT NULL DEFAULT 0,
  experimental_count INT NOT NULL DEFAULT 0,
  deprecated_count INT NOT NULL DEFAULT 0,
  broken_count INT NOT NULL DEFAULT 0,
  unknown_count INT NOT NULL DEFAULT 0,
  conflict_count INT NOT NULL DEFAULT 0,
  resolved_count INT NOT NULL DEFAULT 0,
  data_integrity NUMERIC NOT NULL DEFAULT 0,
  revenue_integrity NUMERIC NOT NULL DEFAULT 0,
  analytics_integrity NUMERIC NOT NULL DEFAULT 0,
  financial_integrity NUMERIC NOT NULL DEFAULT 0,
  ai_integrity NUMERIC NOT NULL DEFAULT 0,
  operational_integrity NUMERIC NOT NULL DEFAULT 0,
  overall_truth_score NUMERIC NOT NULL DEFAULT 0,
  executive_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint TEXT
);
GRANT SELECT ON public.genesis_truth_snapshots TO authenticated;
GRANT ALL ON public.genesis_truth_snapshots TO service_role;
ALTER TABLE public.genesis_truth_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read truth snapshots" ON public.genesis_truth_snapshots FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "service write truth snapshots" ON public.genesis_truth_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.genesis_truth_lineage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key TEXT NOT NULL,
  node_type TEXT NOT NULL,
  node_name TEXT NOT NULL,
  role TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_truth_lineage TO authenticated;
GRANT ALL ON public.genesis_truth_lineage TO service_role;
ALTER TABLE public.genesis_truth_lineage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read truth lineage" ON public.genesis_truth_lineage FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "service write truth lineage" ON public.genesis_truth_lineage FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_truth_metrics_domain ON public.genesis_truth_metrics(domain);
CREATE INDEX idx_truth_metrics_status ON public.genesis_truth_metrics(status);
CREATE INDEX idx_truth_conflicts_status ON public.genesis_truth_conflicts(status);
CREATE INDEX idx_truth_lineage_metric ON public.genesis_truth_lineage(metric_key);

CREATE TRIGGER trg_truth_metrics_updated BEFORE UPDATE ON public.genesis_truth_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
