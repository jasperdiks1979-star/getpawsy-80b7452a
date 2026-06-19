INSERT INTO public.pinterest_video_assets (filename, storage_bucket, storage_path, public_url, duration_seconds, aspect_ratio, mime_type, hook_type, product_slug, content_hash, country_target, language_target, is_active)
VALUES (
  'cinematic-durian-shape-cat-scratching-bed-ec06c41f.mp4',
  'cinematic-ads',
  'ec06c41f-93dc-4dcb-a1ed-39856c761041/output.mp4',
  'https://nojvgfbcjgipjxpfatmm.supabase.co/storage/v1/object/public/cinematic-ads/durian-shape-cat-scratching-bed-cat-house-comfortable-sisal-rope-scratching-a7ee/ec06c41f-93dc-4dcb-a1ed-39856c761041.mp4',
  24,
  '9:16',
  'video/mp4',
  'what-does-your-cat-truly-desire',
  'durian-shape-cat-scratching-bed-cat-house-comfortable-sisal-rope-scratching-a7ee',
  encode(digest('ec06c41f-93dc-4dcb-a1ed-39856c761041','sha256'),'hex'),
  'US',
  'en',
  true
)
ON CONFLICT (content_hash) DO NOTHING;
UPDATE public.cinematic_ad_jobs SET pinterest_asset_id = (SELECT id FROM public.pinterest_video_assets WHERE content_hash=encode(digest('ec06c41f-93dc-4dcb-a1ed-39856c761041','sha256'),'hex') LIMIT 1), pushed_to_pinterest_at=now(), updated_at=now() WHERE id='ec06c41f-93dc-4dcb-a1ed-39856c761041';