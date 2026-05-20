-- Backfill values so constraints and downstream logic behave predictably.
UPDATE public.cinematic_ad_jobs
SET
  qa_report = COALESCE(qa_report, '{}'::jsonb),
  needs_admin_review = COALESCE(needs_admin_review, false),
  smart_retry_count = COALESCE(smart_retry_count, 0),
  render_priority_score = COALESCE(render_priority_score, 0)
WHERE
  qa_report IS NULL
  OR needs_admin_review IS NULL
  OR smart_retry_count IS NULL
  OR render_priority_score IS NULL;

ALTER TABLE public.cinematic_ad_jobs
  ALTER COLUMN render_priority_score SET DEFAULT 0;

ALTER TABLE public.cinematic_ad_jobs
  ADD CONSTRAINT cinematic_ad_jobs_classification_confidence_chk
    CHECK (
      classification_confidence IS NULL
      OR classification_confidence BETWEEN 0 AND 100
    ),
  ADD CONSTRAINT cinematic_ad_jobs_qa_score_chk
    CHECK (
      qa_score IS NULL
      OR qa_score BETWEEN 0 AND 100
    ),
  ADD CONSTRAINT cinematic_ad_jobs_render_priority_score_chk
    CHECK (
      render_priority_score IS NULL
      OR render_priority_score >= 0
    ),
  ADD CONSTRAINT cinematic_ad_jobs_smart_retry_count_chk
    CHECK (smart_retry_count >= 0),
  ADD CONSTRAINT cinematic_ad_jobs_risk_level_chk
    CHECK (
      risk_level IS NULL
      OR risk_level IN ('low', 'medium', 'high', 'critical')
    ),
  ADD CONSTRAINT cinematic_ad_jobs_qa_report_is_object_chk
    CHECK (jsonb_typeof(qa_report) = 'object');

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_priority_v2
  ON public.cinematic_ad_jobs (
    render_priority_score DESC NULLS LAST,
    render_queued_at ASC,
    created_at ASC
  )
  WHERE status = 'render_queued';

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_needs_review_v2
  ON public.cinematic_ad_jobs (updated_at DESC)
  WHERE needs_admin_review IS TRUE;

CREATE OR REPLACE FUNCTION public.claim_cinematic_ad_job(p_worker_id text, p_job_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(
   id uuid,
   product_id uuid,
   product_slug text,
   hook_variant text,
   scene_assets jsonb,
   vo_url text,
   music_url text,
   render_token text,
   render_attempts integer,
   previous_status text,
   render_worker_id text,
   preset text,
   hook_text text,
   subhook_text text,
   cta_text text,
   product_name text,
   product_price numeric,
   pin_title text,
   pin_description text,
   pin_destination_url text,
   hashtags text[],
   vo_script text,
   product_lock boolean,
   validation_report jsonb
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job public.cinematic_ad_jobs%rowtype;
  v_claimable_statuses text[] := ARRAY['render_queued','awaiting_render'];
BEGIN
  IF NULLIF(TRIM(COALESCE(p_worker_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'worker_id is required';
  END IF;

  IF p_job_id IS NOT NULL THEN
    SELECT j.* INTO v_job
    FROM public.cinematic_ad_jobs AS j
    WHERE j.id = p_job_id
      AND (
        j.status = ANY(v_claimable_statuses)
        OR (j.status = 'rendering' AND j.render_worker_id = p_worker_id)
      )
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
      RETURN;
    END IF;
  ELSE
    SELECT j.* INTO v_job
    FROM public.cinematic_ad_jobs AS j
    WHERE j.status = 'render_queued'
    ORDER BY j.render_priority_score DESC NULLS LAST,
             j.render_queued_at ASC NULLS LAST,
             j.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  UPDATE public.cinematic_ad_jobs AS j
  SET
    status = 'rendering',
    render_worker_id = p_worker_id,
    render_started_at = CASE
      WHEN j.status = 'rendering' THEN j.render_started_at
      ELSE now()
    END,
    render_heartbeat_at = now(),
    render_attempts = COALESCE(j.render_attempts, 0) +
      CASE WHEN j.status <> 'rendering' THEN 1 ELSE 0 END,
    status_message = 'worker ' || p_worker_id || ' claimed job',
    render_log = COALESCE(j.render_log, '[]'::jsonb) ||
      jsonb_build_array(
        jsonb_build_object(
          'event', 'render_started',
          'at', now(),
          'worker_id', p_worker_id
        )
      ),
    updated_at = now()
  WHERE j.id = v_job.id
    AND (
      j.status = ANY(v_claimable_statuses)
      OR (j.status = 'rendering' AND j.render_worker_id = p_worker_id)
    )
  RETURNING
    j.id, j.product_id, j.product_slug, j.hook_variant, j.scene_assets, j.vo_url, j.music_url,
    j.render_token, j.render_attempts, v_job.status AS previous_status, j.render_worker_id,
    j.preset, j.hook_text, j.subhook_text, j.cta_text, j.product_name, j.product_price,
    j.pin_title, j.pin_description, j.pin_destination_url, j.hashtags, j.vo_script,
    j.product_lock, j.validation_report;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_cinematic_ad_job(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_cinematic_ad_job(text, uuid) TO authenticated;

CREATE OR REPLACE VIEW public.cinematic_ad_failure_breakdown
WITH (security_invoker = true)
AS
SELECT
  COALESCE(NULLIF(BTRIM(failure_category), ''), 'unclassified') AS category,
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE recoverable IS TRUE)::int AS recoverable,
  COUNT(*) FILTER (WHERE recoverable IS FALSE)::int AS unrecoverable,
  COUNT(*) FILTER (WHERE recoverable IS NULL)::int AS unknown_recoverability,
  COUNT(*) FILTER (WHERE needs_admin_review IS TRUE)::int AS needs_review,
  MAX(updated_at) AS last_seen_at
FROM public.cinematic_ad_jobs
WHERE status = 'failed'
GROUP BY 1;
