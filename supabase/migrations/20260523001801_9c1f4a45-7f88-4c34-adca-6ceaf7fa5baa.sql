
-- Settings
ALTER TABLE public.cinematic_ad_settings
  ADD COLUMN IF NOT EXISTS min_days_between_same_product integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS reject_white_background boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reject_aggressive_cta boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reject_orange_title_bar boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_visual_uniqueness_score integer NOT NULL DEFAULT 75,
  ADD COLUMN IF NOT EXISTS min_hook_uniqueness_score integer NOT NULL DEFAULT 75,
  ADD COLUMN IF NOT EXISTS min_thumbnail_entropy_score integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS min_first_frame_originality_score integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS allowed_creative_categories jsonb NOT NULL DEFAULT '["cat_parent_struggles","odor_free_home","clean_lifestyle","cozy_pet_living","emotional_relief","funny_cat_moments","before_after","aesthetic_home","ugc_vertical"]'::jsonb,
  ADD COLUMN IF NOT EXISTS blocked_creative_styles jsonb NOT NULL DEFAULT '["catalog_white_bg","aggressive_cta_bar","orange_title_bar","template_spam","slideshow_montage"]'::jsonb;

-- Raise existing defaults & current row values
UPDATE public.cinematic_ad_settings
SET hook_cooldown_days = GREATEST(hook_cooldown_days, 30),
    thumbnail_phash_distance_threshold = GREATEST(thumbnail_phash_distance_threshold, 10)
WHERE id = true;

ALTER TABLE public.cinematic_ad_settings
  ALTER COLUMN hook_cooldown_days SET DEFAULT 30,
  ALTER COLUMN thumbnail_phash_distance_threshold SET DEFAULT 10;

-- Jobs
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS creative_category text,
  ADD COLUMN IF NOT EXISTS visual_uniqueness_score integer,
  ADD COLUMN IF NOT EXISTS hook_uniqueness_score integer,
  ADD COLUMN IF NOT EXISTS thumbnail_entropy_score integer,
  ADD COLUMN IF NOT EXISTS first_frame_originality_score integer,
  ADD COLUMN IF NOT EXISTS style_rejection_reason text;

-- Cleanup audit table
CREATE TABLE IF NOT EXISTS public.pinterest_cleanup_audit (
  pin_id text PRIMARY KEY,
  slug text,
  thumbnail_phash text,
  hook_text text,
  creative_category text,
  composite_quality_score integer NOT NULL DEFAULT 0,
  visual_dup_count integer NOT NULL DEFAULT 0,
  slug_repeat_count integer NOT NULL DEFAULT 0,
  hook_repeat_count integer NOT NULL DEFAULT 0,
  is_slideshow_spam boolean NOT NULL DEFAULT false,
  engagement_rate numeric NOT NULL DEFAULT 0,
  recommendation text NOT NULL DEFAULT 'KEEP',
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  audited_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pinterest_cleanup_audit_recommendation_check CHECK (recommendation IN ('KEEP','ARCHIVE','DELETE'))
);

CREATE INDEX IF NOT EXISTS pinterest_cleanup_audit_recommendation_idx ON public.pinterest_cleanup_audit (recommendation);
CREATE INDEX IF NOT EXISTS pinterest_cleanup_audit_score_idx ON public.pinterest_cleanup_audit (composite_quality_score);
CREATE INDEX IF NOT EXISTS pinterest_cleanup_audit_slug_idx ON public.pinterest_cleanup_audit (slug);

ALTER TABLE public.pinterest_cleanup_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin all pinterest_cleanup_audit" ON public.pinterest_cleanup_audit;
CREATE POLICY "admin all pinterest_cleanup_audit"
  ON public.pinterest_cleanup_audit
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Cleanup actions
CREATE TABLE IF NOT EXISTS public.pinterest_cleanup_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id text NOT NULL,
  action text NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  executed_by uuid,
  pre_action_snapshot jsonb,
  result jsonb,
  CONSTRAINT pinterest_cleanup_actions_action_check CHECK (action IN ('archive','delete','restore'))
);

CREATE INDEX IF NOT EXISTS pinterest_cleanup_actions_pin_idx ON public.pinterest_cleanup_actions (pin_id);
CREATE INDEX IF NOT EXISTS pinterest_cleanup_actions_executed_at_idx ON public.pinterest_cleanup_actions (executed_at DESC);

ALTER TABLE public.pinterest_cleanup_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin all pinterest_cleanup_actions" ON public.pinterest_cleanup_actions;
CREATE POLICY "admin all pinterest_cleanup_actions"
  ON public.pinterest_cleanup_actions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
