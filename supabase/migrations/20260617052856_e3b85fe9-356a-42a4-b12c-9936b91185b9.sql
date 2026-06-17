CREATE TABLE IF NOT EXISTS public.revenue_alert_config (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  alert_pinterest_stall BOOLEAN NOT NULL DEFAULT true,
  pinterest_stall_minutes INT NOT NULL DEFAULT 120,
  alert_out_of_stock BOOLEAN NOT NULL DEFAULT true,
  alert_checkout_errors BOOLEAN NOT NULL DEFAULT true,
  checkout_error_threshold INT NOT NULL DEFAULT 3,
  alert_new_order BOOLEAN NOT NULL DEFAULT true,
  alert_revenue_threshold BOOLEAN NOT NULL DEFAULT true,
  revenue_threshold_today_cents BIGINT NOT NULL DEFAULT 50000,
  revenue_threshold_week_cents BIGINT NOT NULL DEFAULT 200000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.revenue_alert_config TO authenticated;
GRANT ALL ON public.revenue_alert_config TO service_role;
ALTER TABLE public.revenue_alert_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read alert config" ON public.revenue_alert_config FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins write alert config" ON public.revenue_alert_config FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.revenue_alert_config (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.revenue_alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  message TEXT NOT NULL,
  twilio_sid TEXT,
  sent_ok BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_revenue_alert_log_key_created ON public.revenue_alert_log (alert_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_alert_log_created ON public.revenue_alert_log (created_at DESC);
GRANT SELECT, INSERT ON public.revenue_alert_log TO authenticated;
GRANT ALL ON public.revenue_alert_log TO service_role;
ALTER TABLE public.revenue_alert_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read alert log" ON public.revenue_alert_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));