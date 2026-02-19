
-- =====================================================
-- AGM: Autonomous Growth Mode Database Schema
-- =====================================================

-- 1) Opportunity Graph nodes
CREATE TABLE public.agm_opportunity_nodes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  node_type TEXT NOT NULL, -- 'query' | 'page' | 'cluster' | 'product' | 'collection' | 'guide'
  node_ref TEXT NOT NULL, -- slug, query string, or ID reference
  title TEXT,
  opportunity_score NUMERIC(5,2) DEFAULT 0,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agm_opportunity_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read opportunity nodes" ON public.agm_opportunity_nodes FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service can insert opportunity nodes" ON public.agm_opportunity_nodes FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update opportunity nodes" ON public.agm_opportunity_nodes FOR UPDATE USING (true);
CREATE INDEX idx_agm_nodes_type ON public.agm_opportunity_nodes(node_type);
CREATE INDEX idx_agm_nodes_score ON public.agm_opportunity_nodes(opportunity_score DESC);

-- 2) Opportunity Graph edges
CREATE TABLE public.agm_opportunity_edges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_node_id UUID NOT NULL REFERENCES public.agm_opportunity_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES public.agm_opportunity_nodes(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL, -- 'relevance' | 'internal_link' | 'cannibalization' | 'funnel' | 'serp_intent'
  weight NUMERIC(5,2) DEFAULT 1.0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agm_opportunity_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read edges" ON public.agm_opportunity_edges FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service can insert edges" ON public.agm_opportunity_edges FOR INSERT WITH CHECK (true);
CREATE INDEX idx_agm_edges_source ON public.agm_opportunity_edges(source_node_id);
CREATE INDEX idx_agm_edges_target ON public.agm_opportunity_edges(target_node_id);

-- 3) Action Queue
CREATE TABLE public.agm_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type TEXT NOT NULL, -- CONTENT_CREATE | CONTENT_REFRESH | INTERNAL_LINK_PATCH | STRUCTURED_DATA_PATCH | MERCHANT_FEED_IMPROVE | TECH_SEO_FIX | INDEXING_SUBMIT
  target_ref TEXT NOT NULL, -- page slug or entity ref
  target_type TEXT, -- 'guide' | 'product' | 'collection' | 'page'
  hypothesis TEXT,
  risk_score NUMERIC(3,1) DEFAULT 0, -- 0-10
  expected_uplift JSONB DEFAULT '{}'::jsonb, -- { impressions_delta, ctr_delta, clicks_delta }
  rollback_plan TEXT,
  measurement_window_days INTEGER DEFAULT 14,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | running | executed | failed | rolled_back | skipped
  execution_mode TEXT NOT NULL DEFAULT 'observe', -- observe | assisted | autonomous_safe | autonomous_full
  brand_guard_pass BOOLEAN,
  diff_snapshot JSONB, -- before/after content diff
  executed_at TIMESTAMP WITH TIME ZONE,
  executed_by TEXT, -- 'system' | user_id
  rollback_at TIMESTAMP WITH TIME ZONE,
  run_id UUID REFERENCES public.job_runs(id),
  batch_id TEXT, -- group actions from same planning cycle
  priority INTEGER DEFAULT 50, -- 0-100
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agm_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read actions" ON public.agm_actions FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service can insert actions" ON public.agm_actions FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update actions" ON public.agm_actions FOR UPDATE USING (true);
CREATE POLICY "Admins can update actions" ON public.agm_actions FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_agm_actions_status ON public.agm_actions(status);
CREATE INDEX idx_agm_actions_type ON public.agm_actions(action_type);
CREATE INDEX idx_agm_actions_created ON public.agm_actions(created_at DESC);

-- 4) Experiment Engine
CREATE TABLE public.agm_experiments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_type TEXT NOT NULL, -- 'title_variant' | 'meta_variant' | 'link_anchor' | 'section_order' | 'faq_snippet'
  target_ref TEXT NOT NULL,
  variant_a JSONB NOT NULL DEFAULT '{}'::jsonb,
  variant_b JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_holdout BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | active | completed | cancelled
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  baseline_metrics JSONB DEFAULT '{}'::jsonb,
  result_metrics JSONB DEFAULT '{}'::jsonb,
  winner TEXT, -- 'a' | 'b' | 'inconclusive'
  confidence NUMERIC(5,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agm_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read experiments" ON public.agm_experiments FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service can manage experiments" ON public.agm_experiments FOR ALL WITH CHECK (true);
CREATE INDEX idx_agm_experiments_status ON public.agm_experiments(status);

-- 5) Impact Tracker
CREATE TABLE public.agm_impact_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_id UUID NOT NULL REFERENCES public.agm_actions(id) ON DELETE CASCADE,
  target_ref TEXT NOT NULL,
  baseline_impressions INTEGER DEFAULT 0,
  baseline_clicks INTEGER DEFAULT 0,
  baseline_ctr NUMERIC(6,4) DEFAULT 0,
  baseline_position NUMERIC(5,2) DEFAULT 0,
  day7_impressions INTEGER,
  day7_clicks INTEGER,
  day7_ctr NUMERIC(6,4),
  day7_position NUMERIC(5,2),
  day14_impressions INTEGER,
  day14_clicks INTEGER,
  day14_ctr NUMERIC(6,4),
  day14_position NUMERIC(5,2),
  day28_impressions INTEGER,
  day28_clicks INTEGER,
  day28_ctr NUMERIC(6,4),
  day28_position NUMERIC(5,2),
  attribution_confidence NUMERIC(3,2) DEFAULT 0, -- 0-1
  anomaly_detected BOOLEAN DEFAULT false,
  auto_rolled_back BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agm_impact_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read impact" ON public.agm_impact_tracking FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service can manage impact" ON public.agm_impact_tracking FOR ALL WITH CHECK (true);
CREATE INDEX idx_agm_impact_action ON public.agm_impact_tracking(action_id);

-- 6) AGM Configuration
CREATE TABLE public.agm_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  execution_mode TEXT NOT NULL DEFAULT 'observe', -- observe | assisted | autonomous_safe | autonomous_full
  daily_action_budget INTEGER DEFAULT 10,
  daily_indexing_budget INTEGER DEFAULT 20,
  max_critical_changes_per_day INTEGER DEFAULT 3,
  min_collection_products INTEGER DEFAULT 4,
  brand_guard_enabled BOOLEAN DEFAULT true,
  auto_rollback_threshold_pct NUMERIC(5,2) DEFAULT 20.0, -- auto-rollback if impressions drop >X%
  playbook_weights JSONB DEFAULT '{"content_create":1.0,"content_refresh":1.2,"internal_link_patch":1.5,"structured_data_patch":1.3,"tech_seo_fix":1.0,"indexing_submit":0.8}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.agm_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read config" ON public.agm_config FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update config" ON public.agm_config FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service can manage config" ON public.agm_config FOR ALL WITH CHECK (true);

-- Insert default config row
INSERT INTO public.agm_config (execution_mode) VALUES ('observe');

-- 7) Playbook learning weights history
CREATE TABLE public.agm_playbook_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type TEXT NOT NULL,
  page_type TEXT, -- 'guide' | 'product' | 'collection' | 'blog'
  success_rate NUMERIC(5,2) DEFAULT 0,
  avg_uplift_impressions NUMERIC(8,2) DEFAULT 0,
  avg_uplift_clicks NUMERIC(8,2) DEFAULT 0,
  sample_count INTEGER DEFAULT 0,
  weight NUMERIC(4,2) DEFAULT 1.0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agm_playbook_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read playbook" ON public.agm_playbook_history FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service can manage playbook" ON public.agm_playbook_history FOR ALL WITH CHECK (true);

-- Add updated_at triggers
CREATE TRIGGER update_agm_nodes_updated_at BEFORE UPDATE ON public.agm_opportunity_nodes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agm_actions_updated_at BEFORE UPDATE ON public.agm_actions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agm_experiments_updated_at BEFORE UPDATE ON public.agm_experiments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agm_impact_updated_at BEFORE UPDATE ON public.agm_impact_tracking FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agm_config_updated_at BEFORE UPDATE ON public.agm_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
