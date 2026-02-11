
-- Add slug column to keyword_rankings for guide-level aggregation
ALTER TABLE public.keyword_rankings ADD COLUMN IF NOT EXISTS slug text;

-- Add last_synced_at for tracking sync status
ALTER TABLE public.keyword_rankings ADD COLUMN IF NOT EXISTS last_synced_at timestamptz DEFAULT now();

-- Add index on slug for fast lookups
CREATE INDEX IF NOT EXISTS idx_keyword_rankings_slug ON public.keyword_rankings (slug);

-- Add index on tracked_date for range queries
CREATE INDEX IF NOT EXISTS idx_keyword_rankings_tracked_date ON public.keyword_rankings (tracked_date DESC);
