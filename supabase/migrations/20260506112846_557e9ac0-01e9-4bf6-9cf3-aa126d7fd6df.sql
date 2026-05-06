CREATE TABLE IF NOT EXISTS public.analytics_quarantine (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  reasons TEXT[] NOT NULL DEFAULT '{}',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_agent TEXT,
  ip_hash TEXT,
  session_id TEXT,
  page_path TEXT,
  referrer TEXT,
  utm_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_quarantine_created_at ON public.analytics_quarantine (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_quarantine_source ON public.analytics_quarantine (source);
CREATE INDEX IF NOT EXISTS idx_analytics_quarantine_reasons ON public.analytics_quarantine USING GIN (reasons);

ALTER TABLE public.analytics_quarantine ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone can insert quarantine events" ON public.analytics_quarantine;
CREATE POLICY "anyone can insert quarantine events"
  ON public.analytics_quarantine FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "admins can read quarantine events" ON public.analytics_quarantine;
CREATE POLICY "admins can read quarantine events"
  ON public.analytics_quarantine FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.count_rejected_events(window_hours INT DEFAULT 24)
RETURNS TABLE (source TEXT, reason TEXT, n BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.source, r AS reason, COUNT(*)::BIGINT AS n
  FROM public.analytics_quarantine q,
       LATERAL UNNEST(COALESCE(q.reasons, ARRAY[]::TEXT[])) AS r
  WHERE q.created_at > now() - make_interval(hours => GREATEST(window_hours, 1))
  GROUP BY q.source, r
  ORDER BY n DESC;
$$;