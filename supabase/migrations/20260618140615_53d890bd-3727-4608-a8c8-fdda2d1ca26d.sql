
-- 1. CONFIG TABLE
CREATE TABLE public.cinematic_v3_dispatch_config (
  id boolean PRIMARY KEY DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  min_queue_size integer NOT NULL DEFAULT 10,
  low_water_mark integer NOT NULL DEFAULT 5,
  max_retries integer NOT NULL DEFAULT 3,
  emergency_idle_minutes integer NOT NULL DEFAULT 30,
  last_dispatch_at timestamptz,
  last_emergency_at timestamptz,
  last_refill_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cinematic_v3_dispatch_config_singleton CHECK (id = true)
);
GRANT SELECT, INSERT, UPDATE ON public.cinematic_v3_dispatch_config TO authenticated;
GRANT ALL ON public.cinematic_v3_dispatch_config TO service_role;
ALTER TABLE public.cinematic_v3_dispatch_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage v3 dispatch config" ON public.cinematic_v3_dispatch_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.cinematic_v3_dispatch_config (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- 2. QUEUE TABLE
CREATE TABLE public.cinematic_v3_dispatch_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL UNIQUE,
  product_slug text NOT NULL,
  priority_score integer NOT NULL DEFAULT 0,
  priority_reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  last_job_id uuid,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cinematic_v3_dispatch_queue_status_chk
    CHECK (status IN ('pending','dispatched','skipped','failed'))
);
CREATE INDEX cinematic_v3_dispatch_queue_status_priority_idx
  ON public.cinematic_v3_dispatch_queue (status, priority_score DESC, enqueued_at ASC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cinematic_v3_dispatch_queue TO authenticated;
GRANT ALL ON public.cinematic_v3_dispatch_queue TO service_role;
ALTER TABLE public.cinematic_v3_dispatch_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage v3 dispatch queue" ON public.cinematic_v3_dispatch_queue
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. LOG TABLE
CREATE TABLE public.cinematic_v3_dispatch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  product_id uuid,
  product_slug text,
  job_id uuid,
  outcome text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cinematic_v3_dispatch_log_created_at_idx
  ON public.cinematic_v3_dispatch_log (created_at DESC);
CREATE INDEX cinematic_v3_dispatch_log_event_type_idx
  ON public.cinematic_v3_dispatch_log (event_type, created_at DESC);
GRANT SELECT ON public.cinematic_v3_dispatch_log TO authenticated;
GRANT ALL ON public.cinematic_v3_dispatch_log TO service_role;
ALTER TABLE public.cinematic_v3_dispatch_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read v3 dispatch log" ON public.cinematic_v3_dispatch_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- updated_at triggers (reuse global helper)
CREATE TRIGGER cinematic_v3_dispatch_config_set_updated_at
  BEFORE UPDATE ON public.cinematic_v3_dispatch_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER cinematic_v3_dispatch_queue_set_updated_at
  BEFORE UPDATE ON public.cinematic_v3_dispatch_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
