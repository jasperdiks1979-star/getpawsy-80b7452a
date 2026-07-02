
-- V11.2 AI Credit Recovery infrastructure

CREATE TABLE IF NOT EXISTS public.ai_credit_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,               -- 'worker'|'product'|'campaign'|'board'|'global'
  scope_key TEXT NOT NULL,           -- e.g. worker name, product id, board id, 'global'
  period TEXT NOT NULL,              -- 'day'|'week'|'month'
  credits_limit INTEGER NOT NULL,
  credits_used INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paused BOOLEAN NOT NULL DEFAULT false,
  paused_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, scope_key, period)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_credit_budgets TO authenticated;
GRANT ALL ON public.ai_credit_budgets TO service_role;
ALTER TABLE public.ai_credit_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage budgets" ON public.ai_credit_budgets FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.ai_credit_recovery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,          -- 'pre_brief_reject'|'duplicate_headline'|'duplicate_prompt'|'circuit_break'|'budget_pause'
  source TEXT,                       -- function name
  scope_key TEXT,
  credits_saved_estimate INTEGER NOT NULL DEFAULT 0,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_credit_recovery_log TO authenticated;
GRANT ALL ON public.ai_credit_recovery_log TO service_role;
ALTER TABLE public.ai_credit_recovery_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read recovery log" ON public.ai_credit_recovery_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service inserts recovery log" ON public.ai_credit_recovery_log FOR INSERT
  WITH CHECK (true);
CREATE INDEX IF NOT EXISTS ai_credit_recovery_log_created_idx ON public.ai_credit_recovery_log (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_credit_recovery_log_type_idx ON public.ai_credit_recovery_log (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_credit_circuit_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circuit_key TEXT NOT NULL UNIQUE,   -- e.g. 'creative-director:image', 'worker:pcie-v2'
  state TEXT NOT NULL DEFAULT 'closed', -- 'closed'|'open'|'half_open'
  failure_count INTEGER NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ,
  reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.ai_credit_circuit_state TO authenticated;
GRANT ALL ON public.ai_credit_circuit_state TO service_role;
ALTER TABLE public.ai_credit_circuit_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage circuits" ON public.ai_credit_circuit_state FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default budgets (conservative, based on V11 evidence: 20,253 credits/7d target -30%)
INSERT INTO public.ai_credit_budgets (scope, scope_key, period, credits_limit)
VALUES
  ('global', 'all', 'day', 3000),
  ('global', 'all', 'week', 15000),
  ('worker', 'creative-director:image', 'day', 2000),
  ('worker', 'creative-director:briefs', 'day', 900)
ON CONFLICT (scope, scope_key, period) DO NOTHING;
