ALTER TABLE public.cinematic_ad_settings
  ALTER COLUMN approval_confidence_threshold SET DEFAULT 55,
  ALTER COLUMN max_duplicate_threshold SET DEFAULT 85,
  ALTER COLUMN min_unique_media_assets SET DEFAULT 2;

ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS captions_visible boolean,
  ADD COLUMN IF NOT EXISTS duration_valid boolean,
  ADD COLUMN IF NOT EXISTS motion_exists boolean,
  ADD COLUMN IF NOT EXISTS video_corrupted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_passed boolean,
  ADD COLUMN IF NOT EXISTS duplicate_risk_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qa_threshold_applied integer,
  ADD COLUMN IF NOT EXISTS qa_decision_reason text,
  ADD COLUMN IF NOT EXISTS pipeline_stage text,
  ADD COLUMN IF NOT EXISTS pinterest_publish_status text NOT NULL DEFAULT 'not_queued',
  ADD COLUMN IF NOT EXISTS pinterest_live_pin_url text,
  ADD COLUMN IF NOT EXISTS last_publish_queue_at timestamptz;

CREATE TABLE IF NOT EXISTS public.cinematic_ad_publish_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.cinematic_ad_jobs(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.pinterest_video_assets(id) ON DELETE SET NULL,
  pinterest_video_queue_id uuid REFERENCES public.pinterest_video_queue(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'publish_pending' CHECK (status IN ('publish_pending','publish_retrying','publish_failed','publish_completed')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  last_error text,
  pin_id text,
  pin_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cinematic_ad_publish_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin all cinematic_ad_publish_queue" ON public.cinematic_ad_publish_queue;
CREATE POLICY "admin all cinematic_ad_publish_queue"
  ON public.cinematic_ad_publish_queue
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_capq_status_next_attempt
  ON public.cinematic_ad_publish_queue(status, next_attempt_at ASC);
CREATE INDEX IF NOT EXISTS idx_capq_job
  ON public.cinematic_ad_publish_queue(job_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_capq_active_job
  ON public.cinematic_ad_publish_queue(job_id)
  WHERE status IN ('publish_pending','publish_retrying');

DROP TRIGGER IF EXISTS capq_touch ON public.cinematic_ad_publish_queue;
CREATE TRIGGER capq_touch
  BEFORE UPDATE ON public.cinematic_ad_publish_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.cinematic_ad_jobs
  DROP CONSTRAINT IF EXISTS cinematic_ad_jobs_duplicate_risk_chk,
  ADD CONSTRAINT cinematic_ad_jobs_duplicate_risk_chk CHECK (duplicate_risk_score BETWEEN 0 AND 100);

CREATE INDEX IF NOT EXISTS idx_cinematic_publish_status
  ON public.cinematic_ad_jobs(pinterest_publish_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cinematic_pipeline_stage
  ON public.cinematic_ad_jobs(pipeline_stage, updated_at DESC);

CREATE OR REPLACE VIEW public.cinematic_ad_pipeline_tracking AS
SELECT
  j.id,
  j.product_slug,
  j.product_name,
  j.status,
  j.pipeline_stage,
  j.render_started_at,
  j.render_complete_at,
  j.validation_passed,
  j.qa_score,
  j.qa_threshold_applied,
  j.approved_at,
  j.pinterest_publish_status,
  q.status AS publish_queue_status,
  q.attempt_count AS publish_attempt_count,
  q.next_attempt_at AS publish_next_attempt_at,
  q.last_error AS publish_last_error,
  COALESCE(j.pinterest_pin_url, j.pinterest_live_pin_url, q.pin_url) AS live_pin_url,
  j.updated_at
FROM public.cinematic_ad_jobs j
LEFT JOIN public.cinematic_ad_publish_queue q
  ON q.job_id = j.id
 AND q.created_at = (
   SELECT max(q2.created_at)
   FROM public.cinematic_ad_publish_queue q2
   WHERE q2.job_id = j.id
 );

REVOKE ALL ON public.cinematic_ad_pipeline_tracking FROM anon, authenticated;
GRANT SELECT ON public.cinematic_ad_pipeline_tracking TO authenticated;