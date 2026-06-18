
CREATE OR REPLACE FUNCTION public.pvq_enforce_destination_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  asset_slug text;
BEGIN
  IF NEW.status IN ('publish_blocked', 'creative_rejected', 'archived', 'failed_permanent', 'needs_recreation') THEN
    RETURN NEW;
  END IF;
  SELECT product_slug INTO asset_slug FROM public.pinterest_video_assets WHERE id = NEW.asset_id;
  IF asset_slug IS NULL THEN RETURN NEW; END IF;
  IF NOT public.pvq_destination_matches_slug(NEW.destination_url, asset_slug) THEN
    NEW.status := 'publish_blocked';
    NEW.error_message := COALESCE(
      'DESTINATION_PRODUCT_MISMATCH: video product_slug=' || asset_slug
        || ' but destination_url=' || COALESCE(NEW.destination_url, '(null)'),
      NEW.error_message
    );
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.pinterest_video_queue q
SET status = 'needs_recreation',
    error_message = 'DESTINATION_PATCH_FAILED: Pinterest pin_edit restricted (Standard Access). Delete and recreate.'
FROM public.pinterest_video_assets a
WHERE a.id = q.asset_id
  AND q.pin_id IS NOT NULL
  AND NOT public.pvq_destination_matches_slug(q.destination_url, a.product_slug);
