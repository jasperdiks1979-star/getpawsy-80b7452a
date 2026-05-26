
-- Track alert dispatch state on key fingerprint
ALTER TABLE public.cinematic_voiceover_key_state
  ADD COLUMN IF NOT EXISTS alert_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS alert_count integer NOT NULL DEFAULT 0;

-- Settings singleton (id=1) for VO key alerts
CREATE TABLE IF NOT EXISTS public.cinematic_voiceover_alert_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  recipient_email text,
  webhook_url text,
  threshold integer NOT NULL DEFAULT 3,
  cooldown_minutes integer NOT NULL DEFAULT 60,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.cinematic_voiceover_alert_settings (id)
  VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.cinematic_voiceover_alert_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage vo alert settings" ON public.cinematic_voiceover_alert_settings;
CREATE POLICY "admins manage vo alert settings"
  ON public.cinematic_voiceover_alert_settings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Append-only log of alerts dispatched
CREATE TABLE IF NOT EXISTS public.cinematic_voiceover_alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_fingerprint text NOT NULL,
  consecutive_failures integer NOT NULL,
  source_function text NOT NULL,
  email_sent boolean NOT NULL DEFAULT false,
  email_error text,
  webhook_sent boolean NOT NULL DEFAULT false,
  webhook_error text,
  webhook_status integer,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cinematic_voiceover_alert_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read vo alert log" ON public.cinematic_voiceover_alert_log;
CREATE POLICY "admins read vo alert log"
  ON public.cinematic_voiceover_alert_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS cv_alert_log_created_idx
  ON public.cinematic_voiceover_alert_log (created_at DESC);
