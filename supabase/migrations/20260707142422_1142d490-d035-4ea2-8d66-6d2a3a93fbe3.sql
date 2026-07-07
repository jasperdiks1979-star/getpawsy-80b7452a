
CREATE TABLE IF NOT EXISTS public.pinterest_live_reality_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  pin_id text NOT NULL,
  http_status int,
  classification text NOT NULL,
  live_title text,
  live_description text,
  live_link text,
  live_board_id text,
  live_created_at timestamptz,
  impressions_30d int,
  pin_clicks_30d int,
  outbound_clicks_30d int,
  saves_30d int,
  analytics_http_status int,
  raw_response jsonb,
  raw_analytics jsonb,
  error text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pinterest_live_reality_audit_run_idx ON public.pinterest_live_reality_audit(run_id);
CREATE INDEX IF NOT EXISTS pinterest_live_reality_audit_pin_idx ON public.pinterest_live_reality_audit(pin_id);

GRANT SELECT ON public.pinterest_live_reality_audit TO authenticated;
GRANT ALL ON public.pinterest_live_reality_audit TO service_role;

ALTER TABLE public.pinterest_live_reality_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read live reality audit"
  ON public.pinterest_live_reality_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
