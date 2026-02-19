
-- Governor decision log table
CREATE TABLE public.governor_decision_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  decision TEXT NOT NULL, -- 'allowed' | 'blocked' | 'softlimit'
  run_type_requested TEXT NOT NULL, -- 'dryrun' | 'fullstack'
  run_type_executed TEXT, -- actual mode allowed
  reason TEXT NOT NULL,
  next_safe_run_seconds INTEGER,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  force_override BOOLEAN NOT NULL DEFAULT false,
  user_id UUID
);

ALTER TABLE public.governor_decision_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view governor logs"
  ON public.governor_decision_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert governor logs"
  ON public.governor_decision_logs FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_governor_logs_created ON public.governor_decision_logs(created_at DESC);
