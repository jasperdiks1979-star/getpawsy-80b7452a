CREATE OR REPLACE VIEW public.cinematic_ad_pipeline_tracking
WITH (security_invoker = true) AS
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