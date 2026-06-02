
CREATE OR REPLACE FUNCTION public.cinematic_queue_health()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH queued AS (
    SELECT count(*)::int AS queued_count, min(render_queued_at) AS oldest_queued_at
    FROM public.cinematic_ad_jobs
    WHERE status = 'render_queued'
  ), rendering AS (
    SELECT count(*)::int AS active_rendering_count,
           max(render_heartbeat_at) AS last_worker_heartbeat_at
    FROM public.cinematic_ad_jobs
    WHERE status = 'rendering'
  ), waiting AS (
    SELECT count(*)::int AS waiting_jobs_count,
           min(COALESCE(queue_wait_next_at, updated_at, created_at)) AS oldest_waiting_at
    FROM public.cinematic_ad_jobs
    WHERE status = 'queue_waiting'
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
    'active_render_count', q.queued_count + r.active_rendering_count,
    'max_render_slots', 6,
    'waiting_jobs', w.waiting_jobs_count,
    'oldest_waiting_at', w.oldest_waiting_at,
    'oldest_waiting_age_seconds', CASE WHEN w.oldest_waiting_at IS NULL THEN NULL ELSE floor(extract(epoch from (now() - w.oldest_waiting_at)))::int END,
    'last_worker_heartbeat_at', r.last_worker_heartbeat_at,
    'last_worker_heartbeat_age_seconds', CASE WHEN r.last_worker_heartbeat_at IS NULL THEN NULL ELSE floor(extract(epoch from (now() - r.last_worker_heartbeat_at)))::int END,
    'last_claimed_job', to_jsonb(lc),
    'last_successful_mp4', to_jsonb(lm)
  )
  FROM queued q
  CROSS JOIN rendering r
  CROSS JOIN waiting w
  LEFT JOIN last_claim lc ON true
  LEFT JOIN last_mp4 lm ON true;
$function$;
