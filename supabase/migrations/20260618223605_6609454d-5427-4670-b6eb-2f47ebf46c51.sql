
DROP VIEW IF EXISTS public.pinterest_video_destination_audit;
CREATE VIEW public.pinterest_video_destination_audit AS
SELECT
  q.id              AS queue_id,
  q.pin_id,
  q.external_url,
  q.status,
  q.created_at,
  q.approved_at,
  a.id              AS asset_id,
  a.product_slug    AS video_product_slug,
  a.thumbnail_url   AS video_thumbnail_url,
  a.public_url      AS video_url,
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
WHERE q.created_at > now() - interval '90 days'
ORDER BY q.created_at DESC;

GRANT SELECT ON public.pinterest_video_destination_audit TO authenticated;
GRANT SELECT ON public.pinterest_video_destination_audit TO service_role;
