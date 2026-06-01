-- Phase 2: backfill double-slash storage URLs that block iPhone Safari playback
UPDATE public.cinematic_ad_jobs
SET output_mp4_url = regexp_replace(output_mp4_url, '([^:])//+', '\1/', 'g')
WHERE output_mp4_url LIKE '%//storage/%';

UPDATE public.cinematic_ad_jobs
SET output_thumbnail_url = regexp_replace(output_thumbnail_url, '([^:])//+', '\1/', 'g')
WHERE output_thumbnail_url LIKE '%//storage/%';

-- Phase 4: motion quality score (0-100) with floor + retry counter
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS motion_quality_score INTEGER,
  ADD COLUMN IF NOT EXISTS motion_regen_attempts INTEGER NOT NULL DEFAULT 0;

-- Settings row: configurable floor (default 70)
ALTER TABLE public.cinematic_ad_settings
  ADD COLUMN IF NOT EXISTS motion_quality_min_score INTEGER NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS motion_quality_max_regen_attempts INTEGER NOT NULL DEFAULT 2;
