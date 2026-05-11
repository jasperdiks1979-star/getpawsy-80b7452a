ALTER TABLE public.pinterest_ai_backdrops
  ADD COLUMN IF NOT EXISTS phash TEXT;

CREATE INDEX IF NOT EXISTS idx_pinterest_ai_backdrops_phash
  ON public.pinterest_ai_backdrops (phash)
  WHERE phash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pinterest_ai_backdrops_updated_at
  ON public.pinterest_ai_backdrops (updated_at DESC);