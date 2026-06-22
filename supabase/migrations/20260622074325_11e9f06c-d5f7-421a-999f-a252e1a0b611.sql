
ALTER TABLE public.pinterest_video_autopilot_settings
  ADD COLUMN IF NOT EXISTS min_publish_gap_minutes integer NOT NULL DEFAULT 90;
UPDATE public.pinterest_video_autopilot_settings
  SET enabled = true, mode = 'autonomous', max_per_day = 30, min_publish_gap_minutes = 90, updated_at = now()
  WHERE id = 1;
