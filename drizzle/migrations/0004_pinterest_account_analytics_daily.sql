CREATE TABLE IF NOT EXISTS public.pinterest_account_analytics_daily (
  day date PRIMARY KEY,
  impressions integer,
  pin_clicks integer,
  outbound_clicks integer,
  saves integer,
  data_status text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.pinterest_account_analytics_daily IS 'Account-wide Pinterest daily metrics from /v5/user_account/analytics. Authoritative totals; pinterest_analytics_daily is the per-pin subset.';
GRANT SELECT ON public.pinterest_account_analytics_daily TO authenticated;
GRANT ALL ON public.pinterest_account_analytics_daily TO service_role;
ALTER TABLE public.pinterest_account_analytics_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read pinterest account analytics" ON public.pinterest_account_analytics_daily
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));