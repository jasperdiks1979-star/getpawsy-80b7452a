
CREATE TABLE IF NOT EXISTS public.analytics_truth_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  window_hours integer NOT NULL DEFAULT 24,
  trust_score integer NOT NULL,
  human_pct numeric NOT NULL,
  bot_pct numeric NOT NULL,
  pinterest_attribution_pct numeric,
  direct_pct numeric,
  total_events integer NOT NULL,
  total_sessions integer NOT NULL,
  human_sessions integer NOT NULL,
  bot_sessions integer NOT NULL,
  duplicate_events integer NOT NULL DEFAULT 0,
  missing_funnel_events integer NOT NULL DEFAULT 0,
  broken_funnels integer NOT NULL DEFAULT 0,
  top_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  metric_explanations jsonb NOT NULL DEFAULT '{}'::jsonb,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  repairs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.analytics_truth_snapshots TO authenticated;
GRANT ALL    ON public.analytics_truth_snapshots TO service_role;

ALTER TABLE public.analytics_truth_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read analytics truth snapshots"
  ON public.analytics_truth_snapshots
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages analytics truth snapshots"
  ON public.analytics_truth_snapshots
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS analytics_truth_snapshots_captured_idx
  ON public.analytics_truth_snapshots (captured_at DESC);

CREATE OR REPLACE FUNCTION public.is_trusted_session(_session_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (tc.traffic_type = 'human')
        AND COALESCE(sq.classification, 'Interested') <> 'Bot'
      FROM public.analytics_traffic_classification tc
      LEFT JOIN public.analytics_session_quality sq
        ON sq.session_id = tc.session_id
      WHERE tc.session_id = _session_id
      ORDER BY tc.classified_at DESC
      LIMIT 1
    ),
    true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_trusted_session(text) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_trusted_sessions
WITH (security_invoker = true)
AS
SELECT s.*
FROM public.canonical_sessions s
WHERE public.is_trusted_session(s.session_id);

GRANT SELECT ON public.v_trusted_sessions TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_trusted_canonical_events
WITH (security_invoker = true)
AS
SELECT e.*
FROM public.canonical_events e
WHERE e.session_id IS NULL
   OR public.is_trusted_session(e.session_id);

GRANT SELECT ON public.v_trusted_canonical_events TO authenticated, service_role;
