CREATE OR REPLACE FUNCTION public.claim_cinematic_ad_job(p_worker_id text, p_job_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, product_id uuid, product_slug text, hook_variant text, scene_assets jsonb, vo_url text, music_url text, render_token text, render_attempts integer, previous_status text, render_worker_id text, preset text, hook_text text, subhook_text text, cta_text text, product_name text, product_price text, pin_title text, pin_description text, pin_destination_url text, hashtags text[], vo_script text, product_lock jsonb, validation_report jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job public.cinematic_ad_jobs%rowtype;
  v_active uuid;
  v_claimable_statuses text[] := ARRAY['render_queued','rendering','awaiting_render','approved','auto_approved','queued'];
  v_blocked_statuses text[] := ARRAY['quarantined','blocked','manual_review_required'];
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

  IF v_active IS NOT NULL AND p_job_id IS NULL THEN
    RETURN;
  END IF;

  IF p_job_id IS NOT NULL THEN
    SELECT * INTO v_job FROM public.cinematic_ad_jobs j WHERE j.id = p_job_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN RETURN; END IF;
    IF v_job.status = ANY (v_blocked_statuses) THEN RETURN; END IF;
    IF NOT (v_job.status = ANY (v_claimable_statuses)) THEN RETURN; END IF;
  ELSE
    SELECT * INTO v_job
    FROM public.cinematic_ad_jobs j
    WHERE j.status = ANY (v_claimable_statuses)
      AND NOT (j.status = ANY (v_blocked_statuses))
    ORDER BY j.render_priority_score DESC NULLS LAST, j.render_queued_at ASC NULLS LAST, j.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
    IF NOT FOUND THEN RETURN; END IF;
  END IF;

  UPDATE public.cinematic_ad_jobs AS j
  SET status = 'rendering',
      render_worker_id = p_worker_id,
      render_started_at = now(),
      render_heartbeat_at = now(),
      render_attempts = COALESCE(v_job.render_attempts, 0) + 1,
      render_token = COALESCE(v_job.render_token, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
      updated_at = now()
  WHERE j.id = v_job.id
  RETURNING j.* INTO v_job;

  RETURN QUERY SELECT
    v_job.id, v_job.product_id, v_job.product_slug, v_job.hook_variant, v_job.scene_assets,
    v_job.vo_url, v_job.music_url, v_job.render_token, v_job.render_attempts,
    NULL::text, v_job.render_worker_id, v_job.preset, v_job.hook_text, v_job.subhook_text,
    v_job.cta_text, v_job.product_name, v_job.product_price, v_job.pin_title, v_job.pin_description,
    v_job.pin_destination_url, v_job.hashtags, v_job.vo_script, v_job.product_lock, v_job.validation_report;
END;
$function$;