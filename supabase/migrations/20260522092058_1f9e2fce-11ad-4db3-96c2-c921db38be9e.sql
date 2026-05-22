
ALTER TABLE public.cinematic_ad_settings
  ADD COLUMN IF NOT EXISTS pinterest_publish_max_per_hour INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS pinterest_publish_min_slug_gap_minutes INTEGER NOT NULL DEFAULT 240,
  ADD COLUMN IF NOT EXISTS pinterest_publish_recovery_mode BOOLEAN NOT NULL DEFAULT true;

UPDATE public.cinematic_ad_settings
SET pinterest_publish_quality_floor = 70
WHERE pinterest_publish_quality_floor IS NULL OR pinterest_publish_quality_floor < 70;
