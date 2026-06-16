CREATE TABLE public.order_sms_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID,
  stripe_session_id TEXT NOT NULL,
  stripe_payment_intent_id TEXT,
  amount NUMERIC(12,2),
  currency TEXT,
  item_count INTEGER,
  to_phone TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending_config',
  twilio_message_sid TEXT,
  error_reason TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX order_sms_alerts_stripe_session_uniq
  ON public.order_sms_alerts (stripe_session_id);

CREATE INDEX order_sms_alerts_status_idx
  ON public.order_sms_alerts (status, created_at DESC);

GRANT SELECT ON public.order_sms_alerts TO authenticated;
GRANT ALL ON public.order_sms_alerts TO service_role;

ALTER TABLE public.order_sms_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read order sms alerts"
  ON public.order_sms_alerts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admins manage order sms alerts"
  ON public.order_sms_alerts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_order_sms_alerts_updated_at
  BEFORE UPDATE ON public.order_sms_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
