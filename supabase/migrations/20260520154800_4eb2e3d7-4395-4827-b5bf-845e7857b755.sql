-- 1. Events table — append-only audit trail for the watchdog + recovery actions
CREATE TABLE public.cinematic_ad_job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.cinematic_ad_jobs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  action_taken text,
  previous_status text,
  new_status text,
  trace_id text,
  error_message text,
  recovery_result text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cinematic_ad_job_events_job_id ON public.cinematic_ad_job_events(job_id, created_at DESC);
CREATE INDEX idx_cinematic_ad_job_events_event_type ON public.cinematic_ad_job_events(event_type, created_at DESC);
CREATE INDEX idx_cinematic_ad_job_events_recent ON public.cinematic_ad_job_events(created_at DESC);

ALTER TABLE public.cinematic_ad_job_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read cinematic_ad_job_events"
ON public.cinematic_ad_job_events FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin write cinematic_ad_job_events"
ON public.cinematic_ad_job_events FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Autopilot singleton state
CREATE TABLE public.cinematic_autopilot_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  paused boolean NOT NULL DEFAULT false,
  paused_reason text,
  paused_at timestamptz,
  paused_by uuid,
  last_watchdog_run_at timestamptz,
  last_watchdog_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  hard_stop_reasons text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.cinematic_autopilot_state(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.cinematic_autopilot_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin all cinematic_autopilot_state"
ON public.cinematic_autopilot_state FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER cinematic_autopilot_state_touch
BEFORE UPDATE ON public.cinematic_autopilot_state
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Helper: log a watchdog event (callable by service role; safe definer)
CREATE OR REPLACE FUNCTION public.cinematic_autopilot_log_event(
  _job_id uuid,
  _event_type text,
  _action_taken text DEFAULT NULL,
  _previous_status text DEFAULT NULL,
  _new_status text DEFAULT NULL,
  _trace_id text DEFAULT NULL,
  _error_message text DEFAULT NULL,
  _recovery_result text DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.cinematic_ad_job_events(
    job_id, event_type, action_taken, previous_status, new_status,
    trace_id, error_message, recovery_result, payload
  )
  VALUES (
    _job_id, _event_type, _action_taken, _previous_status, _new_status,
    _trace_id, _error_message, _recovery_result, COALESCE(_payload, '{}'::jsonb)
  )
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- 4. Dashboard snapshot
CREATE OR REPLACE FUNCTION public.cinematic_autopilot_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state record;
  v_active int;
  v_recovered_today int;
  v_failed_after_retries int;
  v_needs_review int;
  v_blocker text;
  v_overall text;
BEGIN
  SELECT * INTO v_state FROM public.cinematic_autopilot_state WHERE id = 1;

  SELECT count(*) INTO v_active
  FROM public.cinematic_ad_jobs
  WHERE status IN ('render_queued','rendering');

  SELECT count(*) INTO v_recovered_today
  FROM public.cinematic_ad_job_events
  WHERE event_type IN ('auto_recovered','redispatched','retry_scheduled')
    AND recovery_result = 'success'
    AND created_at > now() - interval '24 hours';

  SELECT count(*) INTO v_failed_after_retries
  FROM public.cinematic_ad_jobs
  WHERE status = 'needs_admin_review';

  SELECT count(*) INTO v_needs_review
  FROM public.cinematic_ad_jobs
  WHERE status = 'needs_admin_review';

  v_blocker := NULL;
  IF v_state.paused THEN
    v_overall := 'paused';
    v_blocker := COALESCE(v_state.paused_reason, 'paused by admin');
  ELSIF array_length(v_state.hard_stop_reasons, 1) > 0 THEN
    v_overall := 'blocked';
    v_blocker := v_state.hard_stop_reasons[1];
  ELSIF v_needs_review > 0 OR v_failed_after_retries > 0 THEN
    v_overall := 'degraded';
    v_blocker := v_needs_review || ' job(s) need admin review';
  ELSE
    v_overall := 'healthy';
  END IF;

  RETURN jsonb_build_object(
    'overall', v_overall,
    'paused', v_state.paused,
    'paused_reason', v_state.paused_reason,
    'paused_at', v_state.paused_at,
    'hard_stop_reasons', v_state.hard_stop_reasons,
    'active_jobs', v_active,
    'recovered_today', v_recovered_today,
    'failed_after_retries', v_failed_after_retries,
    'needs_review', v_needs_review,
    'current_blocker', v_blocker,
    'last_watchdog_run_at', v_state.last_watchdog_run_at,
    'last_watchdog_result', v_state.last_watchdog_result,
    'next_watchdog_run_estimate', CASE
      WHEN v_state.last_watchdog_run_at IS NULL THEN now() + interval '60 seconds'
      ELSE v_state.last_watchdog_run_at + interval '60 seconds'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cinematic_autopilot_dashboard() FROM public;
GRANT EXECUTE ON FUNCTION public.cinematic_autopilot_dashboard() TO authenticated;
REVOKE ALL ON FUNCTION public.cinematic_autopilot_log_event(uuid,text,text,text,text,text,text,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.cinematic_autopilot_log_event(uuid,text,text,text,text,text,text,text,jsonb) TO authenticated, service_role;