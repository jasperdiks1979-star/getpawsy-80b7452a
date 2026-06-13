
CREATE TABLE IF NOT EXISTS public.cj_video_ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  products_scanned int NOT NULL DEFAULT 0,
  cj_fetch_success int NOT NULL DEFAULT 0,
  cj_fetch_failed int NOT NULL DEFAULT 0,
  videos_found int NOT NULL DEFAULT 0,
  videos_resolved int NOT NULL DEFAULT 0,
  videos_imported int NOT NULL DEFAULT 0,
  videos_rejected int NOT NULL DEFAULT 0,
  rejection_reasons jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cj_video_ingestion_runs TO authenticated;
GRANT ALL ON public.cj_video_ingestion_runs TO service_role;

ALTER TABLE public.cj_video_ingestion_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read cj video runs" ON public.cj_video_ingestion_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS cj_video_ingestion_runs_started_idx
  ON public.cj_video_ingestion_runs(started_at DESC);
