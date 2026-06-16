-- SMS alert audit log table
CREATE TABLE public.sms_alert_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  alert_type text NOT NULL DEFAULT 'order',
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  stripe_session_id text,
  recipient text,
  body text,
  status text NOT NULL,
  twilio_message_sid text,
  error_reason text
);
CREATE INDEX sms_alert_logs_created_idx ON public.sms_alert_logs (created_at DESC);
CREATE INDEX sms_alert_logs_session_idx ON public.sms_alert_logs (stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE UNIQUE INDEX sms_alert_logs_session_order_uniq
  ON public.sms_alert_logs (stripe_session_id)
  WHERE alert_type = 'order' AND stripe_session_id IS NOT NULL AND status = 'sent';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_alert_logs TO authenticated;
GRANT ALL ON public.sms_alert_logs TO service_role;

ALTER TABLE public.sms_alert_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read sms_alert_logs"
  ON public.sms_alert_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins manage sms_alert_logs"
  ON public.sms_alert_logs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));