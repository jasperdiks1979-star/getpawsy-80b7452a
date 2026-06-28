
-- Engine registry
CREATE TABLE public.aos_engine_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  category text,
  weight numeric NOT NULL DEFAULT 1.0,
  trust_score numeric NOT NULL DEFAULT 0.5,
  health text NOT NULL DEFAULT 'unknown',
  last_heartbeat_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.aos_engine_registry TO authenticated;
GRANT ALL ON public.aos_engine_registry TO service_role;
ALTER TABLE public.aos_engine_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aos_reg admin" ON public.aos_engine_registry FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Shared knowledge graph
CREATE TABLE public.aos_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  key text NOT NULL,
  version int NOT NULL DEFAULT 1,
  publisher_engine text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.5,
  supersedes_id uuid REFERENCES public.aos_knowledge(id) ON DELETE SET NULL,
  superseded_at timestamptz,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX aos_kn_topic_idx ON public.aos_knowledge(topic, key);
CREATE INDEX aos_kn_publisher_idx ON public.aos_knowledge(publisher_engine, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.aos_knowledge TO authenticated;
GRANT ALL ON public.aos_knowledge TO service_role;
ALTER TABLE public.aos_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aos_kn admin" ON public.aos_knowledge FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Unified event bus (append-only)
CREATE TABLE public.aos_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_no bigserial NOT NULL,
  event_type text NOT NULL,
  source_engine text,
  subject text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'info',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX aos_ev_type_idx ON public.aos_events(event_type, occurred_at DESC);
CREATE INDEX aos_ev_seq_idx ON public.aos_events(sequence_no);
GRANT SELECT, INSERT ON public.aos_events TO authenticated;
GRANT ALL ON public.aos_events TO service_role;
ALTER TABLE public.aos_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aos_ev admin read" ON public.aos_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "aos_ev admin insert" ON public.aos_events FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.aos_block_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'aos_events is append-only'; END;
$$;
CREATE TRIGGER aos_ev_no_update BEFORE UPDATE ON public.aos_events FOR EACH ROW EXECUTE FUNCTION public.aos_block_event_mutation();
CREATE TRIGGER aos_ev_no_delete BEFORE DELETE ON public.aos_events FOR EACH ROW EXECUTE FUNCTION public.aos_block_event_mutation();

-- Event subscriptions
CREATE TABLE public.aos_event_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_key text NOT NULL,
  event_type text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  last_seen_seq bigint DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(engine_key, event_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aos_event_subscriptions TO authenticated;
GRANT ALL ON public.aos_event_subscriptions TO service_role;
ALTER TABLE public.aos_event_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aos_sub admin" ON public.aos_event_subscriptions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Global prioritized task queue
CREATE TABLE public.aos_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  owner_engine text,
  priority int NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  related_event_id uuid REFERENCES public.aos_events(id) ON DELETE SET NULL,
  resource_estimate jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  error text
);
CREATE INDEX aos_tasks_pri_idx ON public.aos_tasks(status, priority DESC, created_at);
GRANT SELECT, INSERT, UPDATE ON public.aos_tasks TO authenticated;
GRANT ALL ON public.aos_tasks TO service_role;
ALTER TABLE public.aos_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aos_tasks admin" ON public.aos_tasks FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Resource usage snapshots
CREATE TABLE public.aos_resource_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text NOT NULL,
  used numeric,
  cap numeric,
  pct numeric,
  status text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX aos_res_idx ON public.aos_resource_usage(resource, recorded_at DESC);
GRANT SELECT, INSERT ON public.aos_resource_usage TO authenticated;
GRANT ALL ON public.aos_resource_usage TO service_role;
ALTER TABLE public.aos_resource_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aos_res admin" ON public.aos_resource_usage FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Consensus decisions
CREATE TABLE public.aos_consensus_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  proposal jsonb NOT NULL,
  status text NOT NULL DEFAULT 'voting',
  required_weight numeric NOT NULL DEFAULT 0.66,
  resolved_at timestamptz,
  final_verdict text,
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.aos_consensus_decisions TO authenticated;
GRANT ALL ON public.aos_consensus_decisions TO service_role;
ALTER TABLE public.aos_consensus_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aos_cons admin" ON public.aos_consensus_decisions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.aos_consensus_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES public.aos_consensus_decisions(id) ON DELETE CASCADE,
  engine_key text NOT NULL,
  vote text NOT NULL,
  weight numeric NOT NULL DEFAULT 1.0,
  confidence numeric,
  reasoning text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(decision_id, engine_key)
);
GRANT SELECT, INSERT, UPDATE ON public.aos_consensus_votes TO authenticated;
GRANT ALL ON public.aos_consensus_votes TO service_role;
ALTER TABLE public.aos_consensus_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aos_vote admin" ON public.aos_consensus_votes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Failover events
CREATE TABLE public.aos_failover_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_key text NOT NULL,
  failure_type text NOT NULL,
  recovery_action text,
  status text NOT NULL DEFAULT 'open',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.aos_failover_events TO authenticated;
GRANT ALL ON public.aos_failover_events TO service_role;
ALTER TABLE public.aos_failover_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aos_fail admin" ON public.aos_failover_events FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- System health snapshots
CREATE TABLE public.aos_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_health numeric,
  business_health numeric,
  traffic_health numeric,
  creative_health numeric,
  revenue_health numeric,
  tracking_health numeric,
  infra_health numeric,
  cx_health numeric,
  overall_score numeric,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.aos_health_snapshots TO authenticated;
GRANT ALL ON public.aos_health_snapshots TO service_role;
ALTER TABLE public.aos_health_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aos_h admin" ON public.aos_health_snapshots FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Daily strategy
CREATE TABLE public.aos_daily_strategy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_date date NOT NULL UNIQUE,
  best_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  worst_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  best_creatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  worst_creatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  inventory_risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  trends jsonb NOT NULL DEFAULT '{}'::jsonb,
  strategy text,
  briefing_md text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.aos_daily_strategy TO authenticated;
GRANT ALL ON public.aos_daily_strategy TO service_role;
ALTER TABLE public.aos_daily_strategy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aos_strat admin" ON public.aos_daily_strategy FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Digital twin
CREATE TABLE public.aos_digital_twin_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horizon text NOT NULL,
  predicted jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual jsonb,
  error jsonb,
  confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  evaluated_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.aos_digital_twin_snapshots TO authenticated;
GRANT ALL ON public.aos_digital_twin_snapshots TO service_role;
ALTER TABLE public.aos_digital_twin_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aos_twin admin" ON public.aos_digital_twin_snapshots FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Orchestrator runs
CREATE TABLE public.aos_orchestrator_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL DEFAULT 'cron',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  events_ingested int DEFAULT 0,
  tasks_scheduled int DEFAULT 0,
  consensus_resolved int DEFAULT 0,
  health_score numeric,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);
GRANT SELECT, INSERT, UPDATE ON public.aos_orchestrator_runs TO authenticated;
GRANT ALL ON public.aos_orchestrator_runs TO service_role;
ALTER TABLE public.aos_orchestrator_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aos_runs admin" ON public.aos_orchestrator_runs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.aos_orchestrator_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.aos_orchestrator_runs(id) ON DELETE CASCADE,
  step text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  duration_ms int,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.aos_orchestrator_steps TO authenticated;
GRANT ALL ON public.aos_orchestrator_steps TO service_role;
ALTER TABLE public.aos_orchestrator_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aos_steps admin" ON public.aos_orchestrator_steps FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Settings
CREATE TABLE public.aos_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aos_settings TO authenticated;
GRANT ALL ON public.aos_settings TO service_role;
ALTER TABLE public.aos_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aos_settings admin" ON public.aos_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
