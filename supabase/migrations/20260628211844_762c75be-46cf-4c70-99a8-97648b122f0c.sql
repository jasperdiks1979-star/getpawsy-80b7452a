
-- AGD: Autonomous Growth Director foundation

CREATE TABLE IF NOT EXISTS public.agd_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agd_settings TO authenticated;
GRANT ALL ON public.agd_settings TO service_role;
ALTER TABLE public.agd_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agd_settings admin read" ON public.agd_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.agd_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  metric text NOT NULL,
  dimension jsonb NOT NULL DEFAULT '{}'::jsonb,
  value numeric,
  value_text text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agd_signals_obs_idx ON public.agd_signals (observed_at DESC);
CREATE INDEX IF NOT EXISTS agd_signals_source_metric_idx ON public.agd_signals (source, metric, observed_at DESC);
GRANT SELECT ON public.agd_signals TO authenticated;
GRANT ALL ON public.agd_signals TO service_role;
ALTER TABLE public.agd_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agd_signals admin read" ON public.agd_signals FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.agd_knowledge_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type text NOT NULL,
  ref_id text NOT NULL,
  label text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_type, ref_id)
);
GRANT SELECT ON public.agd_knowledge_nodes TO authenticated;
GRANT ALL ON public.agd_knowledge_nodes TO service_role;
ALTER TABLE public.agd_knowledge_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agd_nodes admin read" ON public.agd_knowledge_nodes FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.agd_knowledge_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  src_node uuid NOT NULL REFERENCES public.agd_knowledge_nodes(id) ON DELETE CASCADE,
  dst_node uuid NOT NULL REFERENCES public.agd_knowledge_nodes(id) ON DELETE CASCADE,
  edge_type text NOT NULL,
  weight numeric DEFAULT 1,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agd_edges_src_idx ON public.agd_knowledge_edges (src_node);
CREATE INDEX IF NOT EXISTS agd_edges_dst_idx ON public.agd_knowledge_edges (dst_node);
GRANT SELECT ON public.agd_knowledge_edges TO authenticated;
GRANT ALL ON public.agd_knowledge_edges TO service_role;
ALTER TABLE public.agd_knowledge_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agd_edges admin read" ON public.agd_knowledge_edges FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.agd_hypotheses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text NOT NULL,
  statement text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  expected_impact_cents bigint,
  status text NOT NULL DEFAULT 'open',
  generated_by text NOT NULL DEFAULT 'agd-loop',
  experiment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agd_hypotheses TO authenticated;
GRANT ALL ON public.agd_hypotheses TO service_role;
ALTER TABLE public.agd_hypotheses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agd_hyp admin read" ON public.agd_hypotheses FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.agd_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hypothesis_id uuid REFERENCES public.agd_hypotheses(id) ON DELETE SET NULL,
  name text NOT NULL,
  goal text NOT NULL,
  expected_impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  risk numeric NOT NULL DEFAULT 0.2,
  duration_hours int NOT NULL DEFAULT 72,
  success_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  rollback_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'proposed',
  started_at timestamptz,
  ended_at timestamptz,
  outcome jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agd_experiments TO authenticated;
GRANT ALL ON public.agd_experiments TO service_role;
ALTER TABLE public.agd_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agd_exp admin read" ON public.agd_experiments FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.agd_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decided_at timestamptz NOT NULL DEFAULT now(),
  decision_type text NOT NULL,
  subject text,
  rationale text NOT NULL,
  reasoning_chain jsonb NOT NULL DEFAULT '[]'::jsonb,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  action jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  business_value_score numeric,
  expected_revenue_cents bigint,
  expected_profit_cents bigint,
  status text NOT NULL DEFAULT 'pending',
  outcome jsonb,
  experiment_id uuid REFERENCES public.agd_experiments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agd_decisions_time_idx ON public.agd_decisions (decided_at DESC);
GRANT SELECT ON public.agd_decisions TO authenticated;
GRANT ALL ON public.agd_decisions TO service_role;
ALTER TABLE public.agd_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agd_dec admin read" ON public.agd_decisions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.agd_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  title text NOT NULL,
  description text,
  bottleneck text,
  business_value_score numeric NOT NULL DEFAULT 0,
  expected_revenue_cents bigint,
  expected_profit_cents bigint,
  effort_score numeric DEFAULT 0.5,
  confidence numeric DEFAULT 0.5,
  status text NOT NULL DEFAULT 'open',
  linked_decision_id uuid REFERENCES public.agd_decisions(id) ON DELETE SET NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agd_opp_status_idx ON public.agd_opportunities (status, business_value_score DESC);
GRANT SELECT ON public.agd_opportunities TO authenticated;
GRANT ALL ON public.agd_opportunities TO service_role;
ALTER TABLE public.agd_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agd_opp admin read" ON public.agd_opportunities FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.agd_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  trigger text NOT NULL DEFAULT 'cron',
  signals_ingested int DEFAULT 0,
  hypotheses_generated int DEFAULT 0,
  decisions_taken int DEFAULT 0,
  opportunities_added int DEFAULT 0,
  bottleneck text,
  growth_score numeric,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);
GRANT SELECT ON public.agd_runs TO authenticated;
GRANT ALL ON public.agd_runs TO service_role;
ALTER TABLE public.agd_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agd_runs admin read" ON public.agd_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.agd_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.agd_runs(id) ON DELETE CASCADE,
  step text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);
CREATE INDEX IF NOT EXISTS agd_steps_run_idx ON public.agd_run_steps (run_id);
GRANT SELECT ON public.agd_run_steps TO authenticated;
GRANT ALL ON public.agd_run_steps TO service_role;
ALTER TABLE public.agd_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agd_steps admin read" ON public.agd_run_steps FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.agd_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at timestamptz NOT NULL DEFAULT now(),
  horizon text NOT NULL,
  metric text NOT NULL,
  predicted_value numeric NOT NULL,
  lower_bound numeric,
  upper_bound numeric,
  confidence numeric,
  model text,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS agd_forecasts_idx ON public.agd_forecasts (metric, horizon, generated_at DESC);
GRANT SELECT ON public.agd_forecasts TO authenticated;
GRANT ALL ON public.agd_forecasts TO service_role;
ALTER TABLE public.agd_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agd_fc admin read" ON public.agd_forecasts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.agd_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_date date NOT NULL UNIQUE,
  revenue_yesterday_cents bigint,
  profit_yesterday_cents bigint,
  top_opportunities jsonb NOT NULL DEFAULT '[]'::jsonb,
  biggest_risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  largest_revenue_leak jsonb,
  best_creative jsonb,
  worst_creative jsonb,
  biggest_conversion_drop jsonb,
  most_profitable_product jsonb,
  fastest_growing_category jsonb,
  recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  predicted_revenue_cents bigint,
  expected_profit_cents bigint,
  growth_score numeric,
  bullets jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agd_briefings TO authenticated;
GRANT ALL ON public.agd_briefings TO service_role;
ALTER TABLE public.agd_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agd_brief admin read" ON public.agd_briefings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.agd_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_type text NOT NULL,
  topic text NOT NULL,
  content jsonb NOT NULL,
  importance numeric DEFAULT 0.5,
  source_run uuid REFERENCES public.agd_runs(id) ON DELETE SET NULL,
  tags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agd_memory_topic_idx ON public.agd_memory (topic);
GRANT SELECT ON public.agd_memory TO authenticated;
GRANT ALL ON public.agd_memory TO service_role;
ALTER TABLE public.agd_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agd_mem admin read" ON public.agd_memory FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Seed default settings
INSERT INTO public.agd_settings (key, value, description) VALUES
  ('feature_flags', '{"autonomous_execution": false, "auto_experiments": false, "auto_resource_allocation": false}'::jsonb, 'AGD master switches'),
  ('thresholds', '{"min_confidence_to_act": 0.85, "min_business_value_score": 60, "max_concurrent_experiments": 5}'::jsonb, 'Decision thresholds'),
  ('forbidden_areas', '["pricing","inventory","supplier","payments","checkout","auth","legal","tax","schema"]'::jsonb, 'AGD must never auto-modify these areas')
ON CONFLICT (key) DO NOTHING;
