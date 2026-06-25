
-- Wave A: Pinterest Growth AI foundation
CREATE TABLE public.pga_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pga_settings TO authenticated;
GRANT ALL ON public.pga_settings TO service_role;
ALTER TABLE public.pga_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY pga_settings_admin ON public.pga_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pga_executive_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT (now()::date),
  window_days int NOT NULL DEFAULT 7,
  revenue_cents bigint NOT NULL DEFAULT 0,
  sessions int NOT NULL DEFAULT 0,
  organic_reach int NOT NULL DEFAULT 0,
  paid_reach int NOT NULL DEFAULT 0,
  ctr numeric(6,4) NOT NULL DEFAULT 0,
  outbound_clicks int NOT NULL DEFAULT 0,
  add_to_cart int NOT NULL DEFAULT 0,
  purchases int NOT NULL DEFAULT 0,
  roas numeric(8,3) NOT NULL DEFAULT 0,
  conversion_rate numeric(6,4) NOT NULL DEFAULT 0,
  growth_score int NOT NULL DEFAULT 0,
  trending_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  losing_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_opportunities jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pga_exec_snap_date_idx ON public.pga_executive_snapshots (snapshot_date DESC);
GRANT SELECT ON public.pga_executive_snapshots TO authenticated;
GRANT ALL ON public.pga_executive_snapshots TO service_role;
ALTER TABLE public.pga_executive_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY pga_exec_snap_admin ON public.pga_executive_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pga_growth_scores_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  section text NOT NULL,
  score int NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, section)
);
GRANT SELECT ON public.pga_growth_scores_daily TO authenticated;
GRANT ALL ON public.pga_growth_scores_daily TO service_role;
ALTER TABLE public.pga_growth_scores_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY pga_gsd_admin ON public.pga_growth_scores_daily FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pga_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  category text NOT NULL DEFAULT 'system',
  severity text NOT NULL DEFAULT 'info',
  summary text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor text NOT NULL DEFAULT 'pga',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pga_timeline_created_idx ON public.pga_timeline_events (created_at DESC);
GRANT SELECT ON public.pga_timeline_events TO authenticated;
GRANT ALL ON public.pga_timeline_events TO service_role;
ALTER TABLE public.pga_timeline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY pga_timeline_admin ON public.pga_timeline_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
