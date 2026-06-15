
-- Singleton state row
CREATE TABLE IF NOT EXISTS public.pinterest_credit_state (
  id smallint PRIMARY KEY DEFAULT 1,
  state text NOT NULL DEFAULT 'green' CHECK (state IN ('green','orange','red')),
  paused boolean NOT NULL DEFAULT false,
  last_success_at timestamptz,
  last_402_at timestamptz,
  last_probe_at timestamptz,
  last_warning_sent_at timestamptz,
  consecutive_402_count integer NOT NULL DEFAULT 0,
  recent_success_count_1h integer NOT NULL DEFAULT 0,
  recent_402_count_1h integer NOT NULL DEFAULT 0,
  estimated_credits_pct numeric,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pinterest_credit_state_singleton CHECK (id = 1)
);

GRANT SELECT ON public.pinterest_credit_state TO authenticated;
GRANT ALL ON public.pinterest_credit_state TO service_role;
ALTER TABLE public.pinterest_credit_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read credit state"
  ON public.pinterest_credit_state FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.pinterest_credit_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Append-only event log
CREATE TABLE IF NOT EXISTS public.pinterest_credit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('success','payment_required','rate_limited','error','probe_success','probe_failed','paused','resumed','warning')),
  status_code integer,
  function_name text,
  message text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pinterest_credit_events TO authenticated;
GRANT ALL ON public.pinterest_credit_events TO service_role;
ALTER TABLE public.pinterest_credit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read credit events"
  ON public.pinterest_credit_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_pinterest_credit_events_created_at
  ON public.pinterest_credit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pinterest_credit_events_event_type
  ON public.pinterest_credit_events (event_type, created_at DESC);
