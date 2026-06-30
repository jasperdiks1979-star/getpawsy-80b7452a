CREATE OR REPLACE VIEW public.pinterest_publishable_queue
WITH (security_invoker = true) AS
SELECT
  q.id,
  q.product_id,
  q.product_slug,
  q.product_name,
  q.pin_variant,
  q.pin_title,
  q.pin_description,
  q.pin_image_url,
  q.destination_link,
  q.board_name,
  q.board_id,
  q.hashtags,
  q.priority,
  q.status,
  q.scheduled_at,
  q.scheduled_at AS effective_publish_at,
  (q.scheduled_at <= now()) AS is_due_now,
  q.posted_at,
  q.error_message,
  q.created_at,
  q.updated_at,
  q.hook_group,
  q.category_key,
  q.overlay_text,
  q.retries,
  q.profit_state,
  q.qa_reasons,
  q.approved_at,
  q.approved_by,
  q.image_hash,
  q.publishing_started_at,
  q.publish_attempts,
  q.last_publish_error,
  q.pinterest_pin_id,
  q.external_url,
  q.rejection_reason,
  q.content_type,
  q.us_audience_score,
  q.idempotency_key,
  q.meta,
  q.source_type,
  q.pcie2_creative_id
FROM public.pinterest_pin_queue q
WHERE q.status = 'queued'
  AND q.pin_image_url IS NOT NULL
  AND q.pin_image_url <> ''
  AND q.destination_link IS NOT NULL
  AND q.destination_link <> ''
  AND (q.profit_state IS NULL OR q.profit_state <> 'kill')
  AND q.retries < 2
  AND q.pinterest_pin_id IS NULL
  AND (
    q.approved_at IS NOT NULL
    OR COALESCE((
      SELECT rs.auto_approve_queue
      FROM public.pinterest_runtime_settings rs
      WHERE rs.id = 1
      LIMIT 1
    ), false)
  );

GRANT SELECT ON public.pinterest_publishable_queue TO authenticated;
GRANT SELECT ON public.pinterest_publishable_queue TO service_role;