
-- ── Slug equality helper ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pvq_destination_matches_slug(dest text, slug text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    dest IS NOT NULL
    AND slug IS NOT NULL
    AND length(slug) > 0
    AND lower(dest) ~ ('/products/' || lower(regexp_replace(slug, '[^a-zA-Z0-9-]', '', 'g')) || '(\?|/|$)');
$$;

-- ── Trigger: block insert/update when video.product_slug != destination_url slug ──
CREATE OR REPLACE FUNCTION public.pvq_enforce_destination_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  asset_slug text;
BEGIN
  -- Skip rows that are already blocked or hard-rejected.
  IF NEW.status IN ('publish_blocked', 'creative_rejected', 'archived', 'failed_permanent') THEN
    RETURN NEW;
  END IF;

  SELECT product_slug INTO asset_slug
  FROM public.pinterest_video_assets
  WHERE id = NEW.asset_id;

  IF asset_slug IS NULL THEN
    RETURN NEW; -- nothing to compare
  END IF;

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

DROP TRIGGER IF EXISTS pvq_enforce_destination_match_tr ON public.pinterest_video_queue;
CREATE TRIGGER pvq_enforce_destination_match_tr
BEFORE INSERT OR UPDATE OF destination_url, asset_id, status
ON public.pinterest_video_queue
FOR EACH ROW
EXECUTE FUNCTION public.pvq_enforce_destination_match();

-- ── Audit view (admin-only via RLS on underlying tables) ─────────────────
CREATE OR REPLACE VIEW public.pinterest_video_destination_audit AS
SELECT
  q.id              AS queue_id,
  q.pin_id,
  q.external_url,
  q.status,
  q.created_at,
  q.approved_at,
  a.id              AS asset_id,
  a.product_slug    AS video_product_slug,
  q.destination_url,
  CASE
    WHEN public.pvq_destination_matches_slug(q.destination_url, a.product_slug) THEN 'MATCH'
    ELSE 'MISMATCH'
  END AS verdict,
  s.id              AS storyboard_id,
  s.product_id      AS storyboard_product_id,
  s.product_slug    AS storyboard_product_slug
FROM public.pinterest_video_queue q
JOIN public.pinterest_video_assets a ON a.id = q.asset_id
LEFT JOIN public.cinematic_v4_storyboards s ON s.id = q.storyboard_id
WHERE q.created_at > now() - interval '30 days'
ORDER BY q.created_at DESC;

GRANT SELECT ON public.pinterest_video_destination_audit TO authenticated;
GRANT SELECT ON public.pinterest_video_destination_audit TO service_role;

-- ── Backfill: mark all existing mismatched rows as publish_blocked ──────
UPDATE public.pinterest_video_queue q
SET status = 'publish_blocked',
    error_message = COALESCE(q.error_message, '') ||
      ' | DESTINATION_PRODUCT_MISMATCH backfill ' || now()::text
FROM public.pinterest_video_assets a
WHERE a.id = q.asset_id
  AND q.status NOT IN ('publish_blocked', 'creative_rejected', 'archived', 'failed_permanent')
  AND NOT public.pvq_destination_matches_slug(q.destination_url, a.product_slug);
