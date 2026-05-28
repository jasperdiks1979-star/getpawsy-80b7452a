-- AI Revenue Insights: persistent storage for AI-generated observations
CREATE TABLE public.ai_revenue_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('global','product','traffic_source','device','audience','funnel')),
  scope_ref TEXT,
  insight_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','critical')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  model TEXT,
  prompt_hash TEXT,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID,
  snoozed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grants: admin-only via app (authenticated + has_role check); service_role for edge functions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_revenue_insights TO authenticated;
GRANT ALL ON public.ai_revenue_insights TO service_role;

-- Enable RLS
ALTER TABLE public.ai_revenue_insights ENABLE ROW LEVEL SECURITY;

-- Admin-only policies (relies on existing public.has_role(uuid, app_role))
CREATE POLICY "Admins can view insights"
  ON public.ai_revenue_insights
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert insights"
  ON public.ai_revenue_insights
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update insights"
  ON public.ai_revenue_insights
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete insights"
  ON public.ai_revenue_insights
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Indexes
CREATE INDEX idx_ai_revenue_insights_generated_at
  ON public.ai_revenue_insights (generated_at DESC);
CREATE INDEX idx_ai_revenue_insights_scope
  ON public.ai_revenue_insights (scope, scope_ref);
CREATE INDEX idx_ai_revenue_insights_severity
  ON public.ai_revenue_insights (severity);
CREATE INDEX idx_ai_revenue_insights_prompt_hash
  ON public.ai_revenue_insights (prompt_hash, generated_at DESC);
CREATE INDEX idx_ai_revenue_insights_active
  ON public.ai_revenue_insights (generated_at DESC)
  WHERE dismissed_at IS NULL;