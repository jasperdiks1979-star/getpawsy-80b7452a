
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS failure_category text,
  ADD COLUMN IF NOT EXISTS root_cause text,
  ADD COLUMN IF NOT EXISTS recommended_fix text,
  ADD COLUMN IF NOT EXISTS classification_confidence integer,
  ADD COLUMN IF NOT EXISTS recoverable boolean,
  ADD COLUMN IF NOT EXISTS risk_level text,
  ADD COLUMN IF NOT EXISTS expected_impact text,
  ADD COLUMN IF NOT EXISTS render_priority_score integer,
  ADD COLUMN IF NOT EXISTS qa_score integer,
  ADD COLUMN IF NOT EXISTS qa_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS needs_admin_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_review_reason text,
  ADD COLUMN IF NOT EXISTS smart_retry_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_priority
  ON public.cinematic_ad_jobs (render_priority_score DESC NULLS LAST, render_queued_at ASC)
  WHERE status = 'render_queued';

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_needs_review
  ON public.cinematic_ad_jobs (needs_admin_review, updated_at DESC)
  WHERE needs_admin_review = true;

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_failure_cat
  ON public.cinematic_ad_jobs (failure_category)
  WHERE status = 'failed';

-- Replace claim RPC: order by render_priority_score DESC NULLS LAST, then FIFO
CREATE OR REPLACE FUNCTION public.claim_cinematic_ad_job(p_worker_id text, p_job_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, product_id uuid, product_slug text, hook_variant text, scene_assets jsonb, vo_url text, music_url text, render_token text, render_attempts integer, previous_status text, render_worker_id text, preset text, hook_text text, subhook_text text, cta_text text, product_name text, product_price text, pin_title text, pin_description text, pin_destination_url text, hashtags text[], vo_script text, product_lock jsonb, validation_report jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job public.cinematic_ad_jobs%rowtype;
  v_active uuid;
  v_claimable_statuses text[] := ARRAY['render_queued','rendering','awaiting_render','approved','queued'];
BEGIN
  IF NULLIF(TRIM(COALESCE(p_worker_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'worker_id is required';
  END IF;

  SELECT j.id INTO v_active
  FROM public.cinematic_ad_jobs AS j
  WHERE j.status = 'rendering'
    AND (p_job_id IS NULL OR j.id <> p_job_id)
  ORDER BY j.render_started_at ASC NULLS LAST
  LIMIT 1;

  IF v_active IS NOT NULL THEN
    RETURN;
  END IF;

  IF p_job_id IS NOT NULL THEN
    SELECT j.* INTO v_job
    FROM public.cinematic_ad_jobs AS j
    WHERE j.id = p_job_id
      AND j.status = ANY(v_claimable_statuses)
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
      RETURN;
    END IF;

    IF v_job.status = 'rendering'
       AND v_job.render_worker_id IS NOT NULL
       AND v_job.render_worker_id <> p_worker_id THEN
      RETURN;
    END IF;
  ELSE
    SELECT j.* INTO v_job
    FROM public.cinematic_ad_jobs AS j
    WHERE j.status = 'render_queued'
    ORDER BY j.render_priority_score DESC NULLS LAST, j.render_queued_at ASC NULLS LAST, j.created_at ASC
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
    render_started_at = COALESCE(j.render_started_at, now()),
    render_heartbeat_at = now(),
    render_attempts = COALESCE(j.render_attempts, 0) + CASE WHEN j.status <> 'rendering' THEN 1 ELSE 0 END,
    status_message = 'worker ' || p_worker_id || ' claimed job',
    render_log = COALESCE(j.render_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('event','render_started','at',now(),'worker_id',p_worker_id)),
    updated_at = now()
  WHERE j.id = v_job.id
    AND j.status = ANY(v_claimable_statuses)
    AND NOT (
      j.status = 'rendering'
      AND j.render_worker_id IS NOT NULL
      AND j.render_worker_id <> p_worker_id
    )
  RETURNING
    j.id, j.product_id, j.product_slug, j.hook_variant, j.scene_assets, j.vo_url, j.music_url,
    j.render_token, j.render_attempts, v_job.status AS previous_status, j.render_worker_id,
    j.preset, j.hook_text, j.subhook_text, j.cta_text, j.product_name, j.product_price,
    j.pin_title, j.pin_description, j.pin_destination_url, j.hashtags, j.vo_script,
    j.product_lock, j.validation_report;
END;
$function$;

CREATE OR REPLACE VIEW public.cinematic_ad_failure_breakdown
WITH (security_invoker = true)
AS
SELECT
  COALESCE(failure_category, 'unclassified') AS category,
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE recoverable IS TRUE)::int AS recoverable,
  COUNT(*) FILTER (WHERE recoverable IS FALSE)::int AS unrecoverable,
  COUNT(*) FILTER (WHERE needs_admin_review IS TRUE)::int AS needs_review,
  MAX(updated_at) AS last_seen_at
FROM public.cinematic_ad_jobs
WHERE status = 'failed'
GROUP BY 1;

REVOKE ALL ON public.cinematic_ad_failure_breakdown FROM anon, authenticated;
GRANT SELECT ON public.cinematic_ad_failure_breakdown TO authenticated;
