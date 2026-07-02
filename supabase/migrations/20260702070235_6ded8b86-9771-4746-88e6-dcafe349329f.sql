
CREATE TABLE IF NOT EXISTS public.sales_readiness_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscore_key text UNIQUE NOT NULL,
  label text NOT NULL,
  weight numeric NOT NULL DEFAULT 0,
  rationale text,
  auto_learned boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sales_readiness_weights TO authenticated;
GRANT ALL ON public.sales_readiness_weights TO service_role;
ALTER TABLE public.sales_readiness_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read weights" ON public.sales_readiness_weights
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update weights" ON public.sales_readiness_weights
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.sales_readiness_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  overall_score numeric NOT NULL,
  confidence numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'computed',
  simulation jsonb NOT NULL DEFAULT '{}'::jsonb,
  priorities jsonb NOT NULL DEFAULT '[]'::jsonb,
  executive_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.sales_readiness_snapshots TO authenticated;
GRANT ALL ON public.sales_readiness_snapshots TO service_role;
ALTER TABLE public.sales_readiness_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read snapshots" ON public.sales_readiness_snapshots
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS sales_readiness_snapshots_captured_idx
  ON public.sales_readiness_snapshots (captured_at DESC);

CREATE TABLE IF NOT EXISTS public.sales_readiness_subscores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.sales_readiness_snapshots(id) ON DELETE CASCADE,
  subscore_key text NOT NULL,
  label text NOT NULL,
  score numeric NOT NULL,
  weight numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text
);
GRANT SELECT ON public.sales_readiness_subscores TO authenticated;
GRANT ALL ON public.sales_readiness_subscores TO service_role;
ALTER TABLE public.sales_readiness_subscores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read subscores" ON public.sales_readiness_subscores
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS sales_readiness_subscores_snapshot_idx
  ON public.sales_readiness_subscores (snapshot_id);

CREATE TABLE IF NOT EXISTS public.sales_readiness_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  snapshot_id uuid REFERENCES public.sales_readiness_snapshots(id) ON DELETE SET NULL,
  overall_score numeric NOT NULL,
  yesterday_score numeric,
  top_blocker text,
  top_opportunity text,
  top_roi_fix text,
  top_risk text,
  expected_impact text,
  confidence numeric NOT NULL DEFAULT 0,
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (briefing_date)
);
GRANT SELECT ON public.sales_readiness_briefings TO authenticated;
GRANT ALL ON public.sales_readiness_briefings TO service_role;
ALTER TABLE public.sales_readiness_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read briefings" ON public.sales_readiness_briefings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.sales_readiness_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid REFERENCES public.sales_readiness_snapshots(id) ON DELETE SET NULL,
  overall_score numeric NOT NULL,
  fingerprint_sha256 text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sales_readiness_certifications TO authenticated;
GRANT ALL ON public.sales_readiness_certifications TO service_role;
ALTER TABLE public.sales_readiness_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read certifications" ON public.sales_readiness_certifications
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
