
CREATE TABLE IF NOT EXISTS public.pinterest_reality_recovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by text,
  phases_requested text[] NOT NULL DEFAULT ARRAY[]::text[],
  phase_current text,
  status text NOT NULL DEFAULT 'running',
  canonical_published int,
  live_before int,
  ghosts_detected int DEFAULT 0,
  ghosts_marked_deleted int DEFAULT 0,
  drift_detected int DEFAULT 0,
  drift_repaired_high_conf int DEFAULT 0,
  drift_skipped_low_conf int DEFAULT 0,
  republish_candidates int DEFAULT 0,
  republished_ok int DEFAULT 0,
  republish_skipped_gates int DEFAULT 0,
  republish_failed_api int DEFAULT 0,
  verified_ok int DEFAULT 0,
  verify_failed int DEFAULT 0,
  live_after int,
  duplicate_titles_live int,
  duplicate_urls_live int,
  boards_used int,
  products_represented int,
  coverage_pct numeric(5,2),
  result text,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pinterest_reality_recovery_runs TO authenticated;
GRANT ALL ON public.pinterest_reality_recovery_runs TO service_role;
ALTER TABLE public.pinterest_reality_recovery_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read recovery runs"
  ON public.pinterest_reality_recovery_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "service_role writes recovery runs"
  ON public.pinterest_reality_recovery_runs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pinterest_reality_recovery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pinterest_reality_recovery_runs(id) ON DELETE CASCADE,
  phase text NOT NULL,
  action text NOT NULL,
  pin_id text,
  new_pin_id text,
  product_id text,
  board_id text,
  http_status int,
  confidence numeric(4,3),
  before_snapshot jsonb,
  after_snapshot jsonb,
  reason text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pinterest_reality_recovery_events_run_idx
  ON public.pinterest_reality_recovery_events(run_id);
CREATE INDEX IF NOT EXISTS pinterest_reality_recovery_events_pin_idx
  ON public.pinterest_reality_recovery_events(pin_id);

GRANT SELECT ON public.pinterest_reality_recovery_events TO authenticated;
GRANT ALL ON public.pinterest_reality_recovery_events TO service_role;
ALTER TABLE public.pinterest_reality_recovery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read recovery events"
  ON public.pinterest_reality_recovery_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "service_role writes recovery events"
  ON public.pinterest_reality_recovery_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_recovery_runs_updated_at
  BEFORE UPDATE ON public.pinterest_reality_recovery_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
