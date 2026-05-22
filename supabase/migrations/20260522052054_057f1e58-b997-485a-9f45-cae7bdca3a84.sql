
ALTER TABLE public.visitor_activity DROP CONSTRAINT IF EXISTS visitor_activity_activity_type_check;
ALTER TABLE public.visitor_activity ADD CONSTRAINT visitor_activity_activity_type_check
  CHECK (activity_type IN ('browsing','cart','checkout','begin_checkout','product_view','add_to_cart','view_cart','purchase'));

ALTER TABLE public.visitor_activity
  ADD COLUMN IF NOT EXISTS is_admin_path boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_bot_suspect boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_suspect_reason text,
  ADD COLUMN IF NOT EXISTS traffic_quality text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS geo_confidence text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS product_category text,
  ADD COLUMN IF NOT EXISTS utm_first_source text,
  ADD COLUMN IF NOT EXISTS utm_first_medium text,
  ADD COLUMN IF NOT EXISTS utm_first_campaign text;

CREATE INDEX IF NOT EXISTS idx_va_traffic_quality ON public.visitor_activity (traffic_quality, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_va_clean_us ON public.visitor_activity (created_at DESC)
  WHERE traffic_quality = 'clean' AND country = 'United States';

CREATE OR REPLACE VIEW public.clean_us_sessions AS
SELECT
  session_id,
  visitor_id,
  MIN(created_at) AS session_start,
  MAX(created_at) AS session_end,
  EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))::int AS duration_seconds,
  MAX(country) AS country,
  MAX(city) AS city,
  MAX(device_type) AS device_type,
  MAX(browser) AS browser,
  MAX(referrer_category) AS referrer_category,
  MAX(utm_first_source) AS utm_source,
  MAX(utm_first_medium) AS utm_medium,
  MAX(utm_first_campaign) AS utm_campaign,
  COUNT(*) AS event_count,
  BOOL_OR(activity_type = 'product_view') AS has_pdp,
  BOOL_OR(activity_type = 'add_to_cart') AS has_atc,
  BOOL_OR(activity_type IN ('checkout','begin_checkout')) AS has_checkout,
  BOOL_OR(activity_type = 'purchase') AS has_purchase
FROM public.visitor_activity
WHERE traffic_quality = 'clean'
  AND country = 'United States'
  AND COALESCE(is_internal, false) = false
GROUP BY session_id, visitor_id;

CREATE OR REPLACE VIEW public.clean_product_performance AS
SELECT
  product_id,
  MAX(product_name) AS product_name,
  MAX(product_category) AS product_category,
  COUNT(*) FILTER (WHERE activity_type = 'product_view') AS views,
  COUNT(*) FILTER (WHERE activity_type = 'add_to_cart') AS add_to_carts,
  COUNT(*) FILTER (WHERE activity_type = 'purchase') AS purchases,
  COALESCE(SUM(order_value) FILTER (WHERE activity_type = 'purchase'), 0) AS revenue
FROM public.visitor_activity
WHERE traffic_quality = 'clean'
  AND country = 'United States'
  AND product_id IS NOT NULL
GROUP BY product_id;

CREATE OR REPLACE VIEW public.clean_channel_performance AS
SELECT
  COALESCE(referrer_category, 'unknown') AS channel,
  COALESCE(utm_first_source, '(none)') AS utm_source,
  COALESCE(utm_first_medium, '(none)') AS utm_medium,
  COUNT(DISTINCT session_id) AS sessions,
  COUNT(*) FILTER (WHERE activity_type = 'product_view') AS pdp_views,
  COUNT(*) FILTER (WHERE activity_type = 'add_to_cart') AS add_to_carts,
  COUNT(*) FILTER (WHERE activity_type = 'purchase') AS purchases,
  COALESCE(SUM(order_value) FILTER (WHERE activity_type = 'purchase'), 0) AS revenue
FROM public.visitor_activity
WHERE traffic_quality = 'clean'
  AND country = 'United States'
GROUP BY COALESCE(referrer_category, 'unknown'),
         COALESCE(utm_first_source, '(none)'),
         COALESCE(utm_first_medium, '(none)');

CREATE OR REPLACE VIEW public.clean_conversion_funnel AS
SELECT
  COUNT(DISTINCT session_id) AS sessions,
  COUNT(DISTINCT session_id) FILTER (WHERE activity_type = 'product_view') AS pdp_sessions,
  COUNT(DISTINCT session_id) FILTER (WHERE activity_type = 'add_to_cart') AS atc_sessions,
  COUNT(DISTINCT session_id) FILTER (WHERE activity_type IN ('checkout','begin_checkout')) AS checkout_sessions,
  COUNT(DISTINCT session_id) FILTER (WHERE activity_type = 'purchase') AS purchase_sessions,
  COALESCE(SUM(order_value) FILTER (WHERE activity_type = 'purchase'), 0) AS revenue
FROM public.visitor_activity
WHERE traffic_quality = 'clean'
  AND country = 'United States'
  AND created_at >= now() - interval '30 days';

REVOKE ALL ON public.clean_us_sessions FROM anon, authenticated;
REVOKE ALL ON public.clean_product_performance FROM anon, authenticated;
REVOKE ALL ON public.clean_channel_performance FROM anon, authenticated;
REVOKE ALL ON public.clean_conversion_funnel FROM anon, authenticated;
GRANT SELECT ON public.clean_us_sessions TO authenticated;
GRANT SELECT ON public.clean_product_performance TO authenticated;
GRANT SELECT ON public.clean_channel_performance TO authenticated;
GRANT SELECT ON public.clean_conversion_funnel TO authenticated;

ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS auto_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_approval_reason text,
  ADD COLUMN IF NOT EXISTS approval_confidence integer,
  ADD COLUMN IF NOT EXISTS approval_source text,
  ADD COLUMN IF NOT EXISTS auto_approval_blocked_reason text;

CREATE INDEX IF NOT EXISTS idx_cinematic_auto_approved
  ON public.cinematic_ad_jobs (auto_approved_at DESC) WHERE auto_approved_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cinematic_ad_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  auto_approve_enabled boolean NOT NULL DEFAULT true,
  approval_confidence_threshold integer NOT NULL DEFAULT 80,
  max_duplicate_threshold integer NOT NULL DEFAULT 70,
  max_retry_threshold integer NOT NULL DEFAULT 3,
  min_unique_media_assets integer NOT NULL DEFAULT 3,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.cinematic_ad_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin all cinematic_ad_settings" ON public.cinematic_ad_settings;
CREATE POLICY "admin all cinematic_ad_settings" ON public.cinematic_ad_settings
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.cinematic_ad_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

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
    SELECT * INTO v_job FROM public.cinematic_ad_jobs WHERE cinematic_ad_jobs.id = p_job_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN RETURN; END IF;
    IF v_job.status = ANY (v_blocked_statuses) THEN RETURN; END IF;
    IF NOT (v_job.status = ANY (v_claimable_statuses)) THEN RETURN; END IF;
  ELSE
    SELECT * INTO v_job
    FROM public.cinematic_ad_jobs
    WHERE status = ANY (v_claimable_statuses)
      AND NOT (status = ANY (v_blocked_statuses))
    ORDER BY render_priority_score DESC NULLS LAST, render_queued_at ASC NULLS LAST, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
    IF NOT FOUND THEN RETURN; END IF;
  END IF;

  UPDATE public.cinematic_ad_jobs
  SET status = 'rendering',
      render_worker_id = p_worker_id,
      render_started_at = now(),
      render_heartbeat_at = now(),
      render_attempts = COALESCE(render_attempts, 0) + 1,
      render_token = COALESCE(render_token, encode(gen_random_bytes(16), 'hex')),
      updated_at = now()
  WHERE cinematic_ad_jobs.id = v_job.id
  RETURNING * INTO v_job;

  RETURN QUERY SELECT
    v_job.id, v_job.product_id, v_job.product_slug, v_job.hook_variant, v_job.scene_assets,
    v_job.vo_url, v_job.music_url, v_job.render_token, v_job.render_attempts,
    NULL::text, v_job.render_worker_id, v_job.preset, v_job.hook_text, v_job.subhook_text,
    v_job.cta_text, v_job.product_name, v_job.product_price, v_job.pin_title, v_job.pin_description,
    v_job.pin_destination_url, v_job.hashtags, v_job.vo_script, v_job.product_lock, v_job.validation_report;
END;
$function$;
