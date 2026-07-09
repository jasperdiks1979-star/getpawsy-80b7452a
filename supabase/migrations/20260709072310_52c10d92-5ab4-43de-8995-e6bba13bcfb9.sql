
CREATE TABLE IF NOT EXISTS public.enterprise_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  rank smallint NOT NULL CHECK (rank BETWEEN 1 AND 3),
  action_type text NOT NULL,
  title text NOT NULL,
  rationale text NOT NULL,
  expected_traffic_uplift_pct numeric,
  expected_revenue_uplift_usd numeric,
  confidence numeric CHECK (confidence >= 0 AND confidence <= 1),
  effort text CHECK (effort IN ('low','medium','high')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  affected_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  affected_boards jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','rejected','executed','validated','missed')),
  outcome jsonb,
  actual_traffic_uplift_pct numeric,
  actual_revenue_uplift_usd numeric,
  reviewed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS enterprise_decisions_date_idx ON public.enterprise_decisions (decision_date DESC, rank);
CREATE INDEX IF NOT EXISTS enterprise_decisions_status_idx ON public.enterprise_decisions (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.enterprise_decisions TO authenticated;
GRANT ALL ON public.enterprise_decisions TO service_role;

ALTER TABLE public.enterprise_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read enterprise decisions"
  ON public.enterprise_decisions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert enterprise decisions"
  ON public.enterprise_decisions FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update enterprise decisions"
  ON public.enterprise_decisions FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete enterprise decisions"
  ON public.enterprise_decisions FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_enterprise_decisions_updated
  BEFORE UPDATE ON public.enterprise_decisions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
