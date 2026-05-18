
-- Settings (single row, id=1)
CREATE TABLE IF NOT EXISTS public.cinematic_ad_alert_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  recipient_email text NOT NULL DEFAULT 'ops@getpawsy.pet',
  queued_threshold_minutes integer NOT NULL DEFAULT 10,
  rendering_threshold_minutes integer NOT NULL DEFAULT 20,
  failure_lookback_minutes integer NOT NULL DEFAULT 60,
  enabled boolean NOT NULL DEFAULT true,
  channel text NOT NULL DEFAULT 'email',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cinematic_ad_alert_settings_singleton CHECK (id = 1)
);

INSERT INTO public.cinematic_ad_alert_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.cinematic_ad_alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin all cinematic_ad_alert_settings"
  ON public.cinematic_ad_alert_settings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER cinematic_ad_alert_settings_touch
  BEFORE UPDATE ON public.cinematic_ad_alert_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Alert log (one row per unique dedupe_key)
CREATE TABLE IF NOT EXISTS public.cinematic_ad_alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,           -- 'stuck_queued' | 'stuck_rendering' | 'render_failed' | 'pinterest_failed' | 'function_error'
  severity text NOT NULL DEFAULT 'warning', -- 'warning' | 'critical'
  job_id uuid REFERENCES public.cinematic_ad_jobs(id) ON DELETE SET NULL,
  function_name text,
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL UNIQUE,
  email_sent boolean NOT NULL DEFAULT false,
  email_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_alert_log_created
  ON public.cinematic_ad_alert_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cinematic_ad_alert_log_type
  ON public.cinematic_ad_alert_log (alert_type, created_at DESC);

ALTER TABLE public.cinematic_ad_alert_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin all cinematic_ad_alert_log"
  ON public.cinematic_ad_alert_log
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
