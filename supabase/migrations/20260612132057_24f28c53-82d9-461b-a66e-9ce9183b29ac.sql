
CREATE TABLE public.pinterest_historical_cleanup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  trigger text NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual','cron')),
  pins_scanned integer NOT NULL DEFAULT 0,
  pins_archived integer NOT NULL DEFAULT 0,
  pins_deleted integer NOT NULL DEFAULT 0,
  pins_replaced integer NOT NULL DEFAULT 0,
  pins_kept integer NOT NULL DEFAULT 0,
  pins_errored integer NOT NULL DEFAULT 0,
  overused_overlays integer NOT NULL DEFAULT 0,
  dry_run boolean NOT NULL DEFAULT false,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_historical_cleanup_runs TO authenticated;
GRANT ALL ON public.pinterest_historical_cleanup_runs TO service_role;
ALTER TABLE public.pinterest_historical_cleanup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all historical cleanup runs"
  ON public.pinterest_historical_cleanup_runs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX pinterest_historical_cleanup_runs_started_idx
  ON public.pinterest_historical_cleanup_runs (started_at DESC);

CREATE TABLE public.pinterest_overlay_frequency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pinterest_historical_cleanup_runs(id) ON DELETE CASCADE,
  overlay_text_norm text NOT NULL,
  overlay_text_sample text NOT NULL,
  frequency integer NOT NULL DEFAULT 0,
  overused boolean NOT NULL DEFAULT false,
  window_size integer NOT NULL DEFAULT 90,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_overlay_frequency TO authenticated;
GRANT ALL ON public.pinterest_overlay_frequency TO service_role;
ALTER TABLE public.pinterest_overlay_frequency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all overlay frequency"
  ON public.pinterest_overlay_frequency
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX pinterest_overlay_frequency_run_idx
  ON public.pinterest_overlay_frequency (run_id, frequency DESC);
