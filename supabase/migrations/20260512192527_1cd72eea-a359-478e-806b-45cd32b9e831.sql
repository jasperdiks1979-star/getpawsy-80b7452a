
ALTER TABLE public.mi_remix_drafts
  ADD COLUMN IF NOT EXISTS published_pin_id text,
  ADD COLUMN IF NOT EXISTS published_video_id text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS performance_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_scored_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_mi_remix_pin ON public.mi_remix_drafts(published_pin_id) WHERE published_pin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mi_remix_video ON public.mi_remix_drafts(published_video_id) WHERE published_video_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.mi_recipe_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.mi_creative_recipes(id) ON DELETE CASCADE,
  window_days integer NOT NULL,
  drafts_count integer NOT NULL DEFAULT 0,
  pins_count integer NOT NULL DEFAULT 0,
  videos_count integer NOT NULL DEFAULT 0,
  total_impressions bigint NOT NULL DEFAULT 0,
  total_engagements bigint NOT NULL DEFAULT 0,
  total_clicks bigint NOT NULL DEFAULT 0,
  avg_ctr numeric NOT NULL DEFAULT 0,
  avg_engagement_rate numeric NOT NULL DEFAULT 0,
  composite_score numeric NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mi_recipe_perf_recipe ON public.mi_recipe_performance(recipe_id, computed_at DESC);

ALTER TABLE public.mi_recipe_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_mi_recipe_performance" ON public.mi_recipe_performance
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
