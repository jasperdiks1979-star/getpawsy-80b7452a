UPDATE public.pinterest_pin_queue
SET status='queued',
    error_message=NULL,
    approved_at=COALESCE(approved_at, now()),
    updated_at=now(),
    meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object('legacy_feed', false, 'publish_allowed', true, 'block_reason', null)
WHERE status='blocked_legacy_source'
  AND pin_image_url IS NOT NULL
  AND (
       pin_image_url ILIKE '%/creative-factory/%'
    OR (meta->>'creative_source') IN ('creative_factory_v1','creative_director_v2')
    OR (meta->>'generator') = 'pinterest-creative-factory'
  );