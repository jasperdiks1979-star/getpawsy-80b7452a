
UPDATE public.pinterest_pin_queue SET
  pin_image_url = v.url,
  board_id = v.bid, board_name = v.bname,
  status = 'queued', approved_at = now(), priority = 'high',
  publish_attempts = 0, publishing_started_at = NULL,
  scheduled_at = now(), rejection_reason = NULL, error_message = NULL,
  last_publish_error = NULL, qa_reasons = '{}',
  meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object(
    'creative_source','creative_factory_v1',
    'photo_lock', true,
    'photo_lock_method','safe_background_extension',
    'photo_lock_at', now()
  ),
  updated_at = now()
FROM (VALUES
  ('0e0ff754-3a0a-4abf-9485-51378104fa3f'::uuid,'https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/pinterest-ads/creative-factory/photolock/41-inch-hand-woven-water-hyacinth-cat-tree-3-sisal-scratching-posts-multi-level-41e1/1784204184771.png','1117103951261719219','Best Cat Trees 2026'),
  ('272b84f9-2b4a-4a33-b8c6-c9719f0b944a'::uuid,'https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/pinterest-ads/creative-factory/photolock/dark-gray-33-5-multi-level-cat-tree-with-2-tier-condo-sisal-scratching-posts-7d9f/1784204194581.png','1117103951261719219','Best Cat Trees 2026'),
  ('3e56eb56-f955-43a9-849e-b65f0e0c2378'::uuid,'https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/pinterest-ads/creative-factory/photolock/pawhut-wall-mounted-cat-tree-4-layer-cat-wall-shelves-furniture-with-scratching-84b3/1784204204898.png','1117103951261719219','Best Cat Trees 2026'),
  ('418810af-0d0f-45ba-837f-f9bcea123ecc'::uuid,'https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/pinterest-ads/creative-factory/photolock/hooded-cat-litter-box-w-litter-mat-litter-particle-catching-gray/1784204213484.png','1117103951261719235','Cat Litter Solutions'),
  ('b6845027-6e7b-49bc-ad85-3ca28d15834f'::uuid,'https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/pinterest-ads/creative-factory/photolock/85-5-cat-tree-height-adjustable-floor-to-ceiling-4-tier-kitty-climbing-activity-center-condo-cat-toy/1784204222886.png','1117103951261719219','Best Cat Trees 2026'),
  ('b84af2cb-8b84-4ec7-92db-9eb3c6adab22'::uuid,'https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/pinterest-ads/creative-factory/photolock/cat-puzzle-toy-with-ball-and-spring-loaded-wand-felt-indoor-cat-toy-box-suction-84be/1784204234891.png','1117103951261719232','Cat Toys & Play'),
  ('c67b4f77-37e1-4280-9db9-8048ab483ce5'::uuid,'https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/pinterest-ads/creative-factory/photolock/double-layer-rice-cat-litter-mat/1784204244639.png','1117103951261719235','Cat Litter Solutions'),
  ('f17b5e91-5da9-4578-9f94-3180e6fc83d5'::uuid,'https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/pinterest-ads/creative-factory/photolock/cat-entertainment-set-interactive-rotating-disk-feather-teasers-tumbler-windmill-toy-keeps-cats-acti/1784204254763.png','1117103951261719232','Cat Toys & Play')
) AS v(vid, url, bid, bname)
WHERE pinterest_pin_queue.id = v.vid;
