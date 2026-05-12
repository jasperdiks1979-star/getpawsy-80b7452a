
ALTER TABLE public.pinterest_video_assets
  ADD COLUMN IF NOT EXISTS detected_platform text,
  ADD COLUMN IF NOT EXISTS country_target text NOT NULL DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS language_target text NOT NULL DEFAULT 'en-US',
  ADD COLUMN IF NOT EXISTS ai_content_score numeric,
  ADD COLUMN IF NOT EXISTS us_market_score numeric,
  ADD COLUMN IF NOT EXISTS pet_relevance_score numeric,
  ADD COLUMN IF NOT EXISTS last_skip_reason text,
  ADD COLUMN IF NOT EXISTS mime_type text;

CREATE TABLE IF NOT EXISTS public.pinterest_video_discovery_skips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  path text NOT NULL,
  filename text NOT NULL,
  size_bytes bigint,
  reason_code text NOT NULL,
  reason_detail text,
  trace_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pvds_created ON public.pinterest_video_discovery_skips(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvds_reason  ON public.pinterest_video_discovery_skips(reason_code);

ALTER TABLE public.pinterest_video_discovery_skips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin all pvds" ON public.pinterest_video_discovery_skips;
CREATE POLICY "admin all pvds"
ON public.pinterest_video_discovery_skips
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
