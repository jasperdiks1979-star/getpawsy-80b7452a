-- Phase 2: clean up duplicate rendering rows before enforcing uniqueness.
-- Keep the oldest actively rendering row and move the rest back to render_queued.

WITH ranked_rendering_jobs AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      ORDER BY render_started_at ASC NULLS LAST, updated_at ASC, created_at ASC, id ASC
    ) AS rn
  FROM public.cinematic_ad_jobs
  WHERE status = 'rendering'
),
jobs_to_requeue AS (
  SELECT id
  FROM ranked_rendering_jobs
  WHERE rn > 1
)
UPDATE public.cinematic_ad_jobs AS j
SET
  status = 'render_queued',
  render_worker_id = NULL,
  render_started_at = NULL,
  render_heartbeat_at = NULL,
  status_message = 'Job re-queued during duplicate rendering cleanup',
  render_log = COALESCE(j.render_log, '[]'::jsonb) ||
    jsonb_build_array(
      jsonb_build_object(
        'event', 'duplicate_rendering_cleanup_requeued',
        'at', now()
      )
    ),
  updated_at = now()
WHERE j.id IN (SELECT id FROM jobs_to_requeue);

CREATE UNIQUE INDEX IF NOT EXISTS cinematic_ad_jobs_one_rendering_job
  ON public.cinematic_ad_jobs ((true))
  WHERE status = 'rendering';
