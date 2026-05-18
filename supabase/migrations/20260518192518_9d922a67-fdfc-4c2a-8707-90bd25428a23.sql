ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS output_width integer,
  ADD COLUMN IF NOT EXISTS output_height integer,
  ADD COLUMN IF NOT EXISTS output_black_bars boolean,
  ADD COLUMN IF NOT EXISTS output_thumbnail_url text;