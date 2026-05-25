CREATE TABLE IF NOT EXISTS public.background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,                       -- e.g. 'content_director_batch'
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',    -- queued | running | done | failed | cancelled
  total integer NOT NULL DEFAULT 0,
  completed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  cancel_requested boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_status
  ON public.background_jobs(status, created_at DESC);

ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin all background_jobs" ON public.background_jobs;
CREATE POLICY "admin all background_jobs"
  ON public.background_jobs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS background_jobs_touch ON public.background_jobs;
CREATE TRIGGER background_jobs_touch
  BEFORE UPDATE ON public.background_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.background_jobs;