ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS product_price text,
  ADD COLUMN IF NOT EXISTS product_lock jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS render_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS render_dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS render_log jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_product_id
  ON public.cinematic_ad_jobs(product_id);

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_render_heartbeat
  ON public.cinematic_ad_jobs(render_heartbeat_at DESC)
  WHERE status = 'rendering';

DROP INDEX IF EXISTS uniq_cinematic_active_product_slug;
CREATE UNIQUE INDEX uniq_cinematic_active_product_slug
  ON public.cinematic_ad_jobs(product_slug)
  WHERE status IN ('pending','preparing','prepared','render_queued','rendering');

DROP FUNCTION IF EXISTS public.claim_cinematic_ad_job(text, uuid);

CREATE OR REPLACE FUNCTION public.claim_cinematic_ad_job(
  p_worker_id text,
  p_job_id uuid DEFAULT NULL
)
RETURNS TABLE (
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
  product_price text,
  pin_title text,
  pin_description text,
  pin_destination_url text,
  hashtags text[],
  vo_script text,
  product_lock jsonb,
  validation_report jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.cinematic_ad_jobs%rowtype;
  v_active uuid;
BEGIN
  IF NULLIF(TRIM(COALESCE(p_worker_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'worker_id is required';
  END IF;

  SELECT id INTO v_active
  FROM public.cinematic_ad_jobs
  WHERE status = 'rendering'
    AND (p_job_id IS NULL OR id <> p_job_id)
  ORDER BY render_started_at ASC NULLS LAST
  LIMIT 1;

  IF v_active IS NOT NULL THEN
    RETURN;
  END IF;

  IF p_job_id IS NOT NULL THEN
    SELECT * INTO v_job
    FROM public.cinematic_ad_jobs
    WHERE cinematic_ad_jobs.id = p_job_id
      AND status IN ('render_queued','rendering')
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
    SELECT * INTO v_job
    FROM public.cinematic_ad_jobs
    WHERE status = 'render_queued'
    ORDER BY render_queued_at ASC NULLS LAST, created_at ASC
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
    AND j.status IN ('render_queued','rendering')
    AND NOT (
      j.status = 'rendering'
      AND j.render_worker_id IS NOT NULL
      AND j.render_worker_id <> p_worker_id
    )
  RETURNING
    j.id,
    j.product_id,
    j.product_slug,
    j.hook_variant,
    j.scene_assets,
    j.vo_url,
    j.music_url,
    j.render_token,
    j.render_attempts,
    v_job.status AS previous_status,
    j.render_worker_id,
    j.preset,
    j.hook_text,
    j.subhook_text,
    j.cta_text,
    j.product_name,
    j.product_price,
    j.pin_title,
    j.pin_description,
    j.pin_destination_url,
    j.hashtags,
    j.vo_script,
    j.product_lock,
    j.validation_report;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_cinematic_ad_job(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cinematic_queue_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH queued AS (
    SELECT count(*)::int AS queued_count, min(render_queued_at) AS oldest_queued_at
    FROM public.cinematic_ad_jobs
    WHERE status = 'render_queued'
  ), rendering AS (
    SELECT count(*)::int AS active_rendering_count
    FROM public.cinematic_ad_jobs
    WHERE status = 'rendering'
  ), last_claim AS (
    SELECT id, product_slug, render_started_at, render_worker_id
    FROM public.cinematic_ad_jobs
    WHERE render_started_at IS NOT NULL
    ORDER BY render_started_at DESC
    LIMIT 1
  ), last_mp4 AS (
    SELECT id, product_slug, output_mp4_url, render_complete_at
    FROM public.cinematic_ad_jobs
    WHERE output_mp4_url IS NOT NULL
    ORDER BY render_complete_at DESC NULLS LAST, updated_at DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'queued_count', q.queued_count,
    'oldest_queued_at', q.oldest_queued_at,
    'oldest_queued_age_seconds', CASE WHEN q.oldest_queued_at IS NULL THEN NULL ELSE floor(extract(epoch from (now() - q.oldest_queued_at)))::int END,
    'active_rendering_count', r.active_rendering_count,
    'last_claimed_job', to_jsonb(lc),
    'last_successful_mp4', to_jsonb(lm)
  )
  FROM queued q
  CROSS JOIN rendering r
  LEFT JOIN last_claim lc ON true
  LEFT JOIN last_mp4 lm ON true;
$$;

GRANT EXECUTE ON FUNCTION public.cinematic_queue_health() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.clear_stale_cinematic_duplicates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  WITH ranked AS (
    SELECT id,
           row_number() OVER (PARTITION BY product_slug ORDER BY render_queued_at ASC NULLS LAST, created_at ASC) AS rn
    FROM public.cinematic_ad_jobs
    WHERE status = 'render_queued'
      AND output_mp4_url IS NULL
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_ids
  FROM ranked
  WHERE rn > 1;

  IF array_length(v_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('cleared', 0, 'ids', '[]'::jsonb);
  END IF;

  UPDATE public.cinematic_ad_jobs
  SET status = 'failed',
      error_message = 'Cleared stale duplicate queued job; oldest active job retained for product.',
      status_message = 'stale duplicate cleared by admin queue cleanup',
      updated_at = now()
  WHERE id = ANY(v_ids);

  RETURN jsonb_build_object('cleared', array_length(v_ids, 1), 'ids', to_jsonb(v_ids));
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_stale_cinematic_duplicates() TO authenticated, service_role;