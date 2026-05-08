CREATE TABLE IF NOT EXISTS public.pinterest_ai_backdrops (
  query TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  storage_path TEXT,
  width INT,
  height INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pinterest_ai_backdrops ENABLE ROW LEVEL SECURITY;

-- No policies: only service role (which bypasses RLS) can read/write.
-- This keeps generated assets private to the automation pipeline.

CREATE INDEX IF NOT EXISTS idx_pinterest_ai_backdrops_created_at
  ON public.pinterest_ai_backdrops(created_at DESC);