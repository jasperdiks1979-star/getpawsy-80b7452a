
CREATE TABLE IF NOT EXISTS public.channel_reallocation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_at timestamptz NOT NULL DEFAULT now(),
  trigger_reason text NOT NULL,
  unavailable_channels text[] NOT NULL DEFAULT '{}',
  reallocated_from jsonb NOT NULL DEFAULT '{}'::jsonb,
  reallocated_to jsonb NOT NULL DEFAULT '{}'::jsonb,
  budget_before jsonb NOT NULL DEFAULT '{}'::jsonb,
  budget_after jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommendations_obsoleted integer NOT NULL DEFAULT 0,
  recommendations_rescored integer NOT NULL DEFAULT 0,
  rationale text,
  method text NOT NULL DEFAULT 'health_weighted',
  dry_run boolean NOT NULL DEFAULT false,
  actor text NOT NULL DEFAULT 'channel-reallocation-engine',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.channel_reallocation_events TO authenticated;
GRANT ALL ON public.channel_reallocation_events TO service_role;

ALTER TABLE public.channel_reallocation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view reallocation events"
  ON public.channel_reallocation_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_channel_realloc_triggered
  ON public.channel_reallocation_events (triggered_at DESC);
