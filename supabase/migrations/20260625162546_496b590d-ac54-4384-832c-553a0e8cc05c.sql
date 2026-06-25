
-- Revenue Recovery Program V1 — diagnostic tables

CREATE TABLE IF NOT EXISTS public.rr_funnel_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  step text NOT NULL,
  status text NOT NULL CHECK (status IN ('green','yellow','red','skip')),
  latency_ms integer,
  evidence jsonb DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rr_funnel_checks_run_idx ON public.rr_funnel_checks(run_id);
CREATE INDEX IF NOT EXISTS rr_funnel_checks_created_idx ON public.rr_funnel_checks(created_at DESC);
GRANT SELECT ON public.rr_funnel_checks TO authenticated;
GRANT ALL ON public.rr_funnel_checks TO service_role;
ALTER TABLE public.rr_funnel_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rr_funnel_checks admin read"
  ON public.rr_funnel_checks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.rr_atc_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  product_slug text NOT NULL,
  device text NOT NULL,
  browser text NOT NULL,
  atc_clickable boolean,
  atc_event_fired boolean,
  capi_row_id uuid,
  ga4_event_id text,
  console_errors jsonb DEFAULT '[]'::jsonb,
  network_errors jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL CHECK (status IN ('green','yellow','red')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rr_atc_audit_run_idx ON public.rr_atc_audit(run_id);
GRANT SELECT ON public.rr_atc_audit TO authenticated;
GRANT ALL ON public.rr_atc_audit TO service_role;
ALTER TABLE public.rr_atc_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rr_atc_audit admin read"
  ON public.rr_atc_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.rr_stripe_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text,
  reason_code text NOT NULL,
  reason_detail text,
  amount_cents integer,
  currency text,
  customer_email text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS rr_stripe_failures_reason_idx ON public.rr_stripe_failures(reason_code);
CREATE INDEX IF NOT EXISTS rr_stripe_failures_occurred_idx ON public.rr_stripe_failures(occurred_at DESC);
GRANT SELECT ON public.rr_stripe_failures TO authenticated;
GRANT ALL ON public.rr_stripe_failures TO service_role;
ALTER TABLE public.rr_stripe_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rr_stripe_failures admin read"
  ON public.rr_stripe_failures FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.rr_self_heal_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  target text,
  outcome text NOT NULL CHECK (outcome IN ('success','failed','skipped','needs_approval')),
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rr_self_heal_log_created_idx ON public.rr_self_heal_log(created_at DESC);
GRANT SELECT ON public.rr_self_heal_log TO authenticated;
GRANT ALL ON public.rr_self_heal_log TO service_role;
ALTER TABLE public.rr_self_heal_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rr_self_heal_log admin read"
  ON public.rr_self_heal_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
