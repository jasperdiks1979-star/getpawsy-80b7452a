
-- GENESIS Ω∞ — CEO Kill Switch Constitution.
-- Extends the Zero-Regression Constitution (genesis_golden_runs).
-- No duplicate monitoring: the Golden Customer trips this switch on fail.

CREATE TABLE IF NOT EXISTS public.ceo_kill_switch_state (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton     boolean NOT NULL DEFAULT true UNIQUE,
  status        text NOT NULL DEFAULT 'clear'
                CHECK (status IN ('clear','degraded','tripped','hotfix_override')),
  reason        text,
  triggered_at  timestamptz,
  cleared_at    timestamptz,
  triggered_by  text,
  golden_run_id uuid REFERENCES public.genesis_golden_runs(id) ON DELETE SET NULL,
  evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ceo_kill_switch_state TO anon, authenticated;
GRANT ALL ON public.ceo_kill_switch_state TO service_role;
ALTER TABLE public.ceo_kill_switch_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kill_switch_read_all"
  ON public.ceo_kill_switch_state FOR SELECT
  USING (true);

CREATE POLICY "kill_switch_admin_write"
  ON public.ceo_kill_switch_state FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.ceo_kill_switch_state (singleton, status, reason)
VALUES (true, 'clear', 'initial state')
ON CONFLICT (singleton) DO NOTHING;

-- Full audit trail of every trip / clear / override
CREATE TABLE IF NOT EXISTS public.ceo_kill_switch_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  event         text NOT NULL CHECK (event IN ('trip','clear','override_on','override_off','deploy_blocked','deploy_allowed')),
  previous_status text,
  new_status    text,
  reason        text,
  actor         text,
  golden_run_id uuid REFERENCES public.genesis_golden_runs(id) ON DELETE SET NULL,
  context       jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.ceo_kill_switch_events TO authenticated;
GRANT ALL ON public.ceo_kill_switch_events TO service_role;
ALTER TABLE public.ceo_kill_switch_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kill_switch_events_admin_read"
  ON public.ceo_kill_switch_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_ceo_events_occurred_at
  ON public.ceo_kill_switch_events (occurred_at DESC);

-- CEO Production Safety Certificates (single, canonical)
CREATE TABLE IF NOT EXISTS public.ceo_production_certificates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issued_at         timestamptz NOT NULL DEFAULT now(),
  golden_run_id     uuid REFERENCES public.genesis_golden_runs(id) ON DELETE SET NULL,
  kill_switch_status text NOT NULL,
  certificate_status text NOT NULL CHECK (certificate_status IN ('pass','fail','degraded')),
  anonymous_journey_ok boolean,
  checkout_ok       boolean,
  stripe_ok         boolean,
  revenue_ok        boolean,
  regression_ok     boolean,
  confidence        numeric,
  sha256            text NOT NULL,
  payload           jsonb NOT NULL
);

GRANT SELECT ON public.ceo_production_certificates TO authenticated;
GRANT ALL ON public.ceo_production_certificates TO service_role;
ALTER TABLE public.ceo_production_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "certificates_admin_read"
  ON public.ceo_production_certificates FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_certificates_issued_at
  ON public.ceo_production_certificates (issued_at DESC);

-- Deployment gate function used by CI + edge functions.
-- Returns clear=true only if kill switch is not tripped OR hotfix override is on.
CREATE OR REPLACE FUNCTION public.ceo_kill_switch_gate(
  p_deployment_kind text DEFAULT 'standard'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  allowed boolean;
  reason text;
BEGIN
  SELECT * INTO s FROM public.ceo_kill_switch_state WHERE singleton = true LIMIT 1;

  -- Hotfix / rollback / diagnostics always allowed
  IF p_deployment_kind IN ('hotfix','rollback','diagnostics','monitoring','evidence','production_validation') THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'kind', p_deployment_kind,
      'kill_switch_status', COALESCE(s.status, 'unknown'),
      'reason', 'safe_exception'
    );
  END IF;

  allowed := COALESCE(s.status, 'clear') IN ('clear','hotfix_override');
  reason  := CASE
    WHEN s.status = 'tripped' THEN 'CEO Kill Switch is TRIPPED — anonymous customer journey is broken.'
    WHEN s.status = 'degraded' THEN 'Production DEGRADED — Golden Customer status unknown or partial.'
    WHEN s.status = 'hotfix_override' THEN 'Hotfix override active — proceed with caution.'
    ELSE 'clear'
  END;

  RETURN jsonb_build_object(
    'allowed', allowed,
    'kind', p_deployment_kind,
    'kill_switch_status', COALESCE(s.status, 'unknown'),
    'triggered_at', s.triggered_at,
    'golden_run_id', s.golden_run_id,
    'reason', reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ceo_kill_switch_gate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ceo_kill_switch_gate(text) TO anon, authenticated, service_role;
