
ALTER TABLE public.pinterest_boards
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 5;

CREATE INDEX IF NOT EXISTS idx_pinterest_boards_priority
  ON public.pinterest_boards (priority, is_blacklisted, is_sandbox);

ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS us_audience_score numeric(4,3);

ALTER TABLE public.pinterest_pin_queue
  DROP CONSTRAINT IF EXISTS pinterest_pin_queue_content_type_check;
ALTER TABLE public.pinterest_pin_queue
  ADD CONSTRAINT pinterest_pin_queue_content_type_check
  CHECK (content_type IN ('guide','comparison','lifestyle','product'));

ALTER TABLE public.pinterest_runtime_settings
  ADD COLUMN IF NOT EXISTS daily_pin_cap integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS min_gap_minutes integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS warmup_until timestamptz,
  ADD COLUMN IF NOT EXISTS us_score_threshold numeric(4,3) NOT NULL DEFAULT 0.55;

UPDATE public.pinterest_runtime_settings
SET warmup_until = COALESCE(warmup_until, now() + interval '14 days')
WHERE id = 1;

-- Seed board priorities by name pattern
UPDATE public.pinterest_boards SET priority = 1
WHERE name ILIKE '%cat tree%' OR name ILIKE '%cat care%' OR name ILIKE '%smart pet%' OR name ILIKE '%indoor cat%';

UPDATE public.pinterest_boards SET priority = 5
WHERE priority IS NULL OR (name ILIKE '%product%' AND name NOT ILIKE '%best%');
