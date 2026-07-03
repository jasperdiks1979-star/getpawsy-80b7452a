-- Force re-classify locked sessions in the 7d window: attribution_locked was
-- set by earlier writers before the pollution rules were tightened. This
-- one-shot backfill overrides the lock ONLY when the current classification
-- is 'direct' and the underlying signals now classify differently.
UPDATE public.canonical_sessions cs
SET classified_channel = public.classify_traffic_source(
      referrer, utm_source, utm_medium,
      jsonb_strip_nulls(jsonb_build_object(
        'gclid', first_gclid, 'fbclid', first_fbclid, 'ttclid', first_ttclid,
        'msclkid', first_msclkid, 'pinterest_click_id', first_pinterest_click_id
      ))
    ),
    attribution_snapshot_at = now()
WHERE first_seen_at >= now() - interval '7 days'
  AND classified_channel = 'direct';
