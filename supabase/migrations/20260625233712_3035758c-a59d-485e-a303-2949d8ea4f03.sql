
-- prie_settings
CREATE TABLE public.prie_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prie_settings TO authenticated;
GRANT ALL ON public.prie_settings TO service_role;
ALTER TABLE public.prie_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prie_settings admin all" ON public.prie_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- prie_brain_snapshots
CREATE TABLE public.prie_brain_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  revenue_score numeric NOT NULL DEFAULT 0,
  growth_score numeric NOT NULL DEFAULT 0,
  seo_score numeric NOT NULL DEFAULT 0,
  creative_score numeric NOT NULL DEFAULT 0,
  automation_score numeric NOT NULL DEFAULT 0,
  health_score numeric NOT NULL DEFAULT 0,
  ai_confidence numeric NOT NULL DEFAULT 0,
  bottleneck text,
  top_action text,
  why_not_grow text,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prie_brain_snapshots TO authenticated;
GRANT ALL ON public.prie_brain_snapshots TO service_role;
ALTER TABLE public.prie_brain_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prie_brain_snapshots admin all" ON public.prie_brain_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX prie_brain_snapshots_captured_idx ON public.prie_brain_snapshots(captured_at DESC);

-- prie_revenue_predictions
CREATE TABLE public.prie_revenue_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  product_slug text,
  horizon_days integer NOT NULL DEFAULT 30,
  expected_impressions numeric NOT NULL DEFAULT 0,
  expected_saves numeric NOT NULL DEFAULT 0,
  expected_closeups numeric NOT NULL DEFAULT 0,
  expected_outbound_clicks numeric NOT NULL DEFAULT 0,
  expected_atc numeric NOT NULL DEFAULT 0,
  expected_purchases numeric NOT NULL DEFAULT 0,
  expected_revenue_cents bigint NOT NULL DEFAULT 0,
  expected_monthly_revenue_cents bigint NOT NULL DEFAULT 0,
  expected_annual_revenue_cents bigint NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, horizon_days)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prie_revenue_predictions TO authenticated;
GRANT ALL ON public.prie_revenue_predictions TO service_role;
ALTER TABLE public.prie_revenue_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prie_revenue_predictions admin all" ON public.prie_revenue_predictions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX prie_revenue_predictions_score_idx ON public.prie_revenue_predictions(expected_revenue_cents DESC);

-- prie_timeline_events
CREATE TABLE public.prie_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  detail text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prie_timeline_events TO authenticated;
GRANT ALL ON public.prie_timeline_events TO service_role;
ALTER TABLE public.prie_timeline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prie_timeline_events admin all" ON public.prie_timeline_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX prie_timeline_events_occurred_idx ON public.prie_timeline_events(occurred_at DESC);
