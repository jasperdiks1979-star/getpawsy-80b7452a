
-- Cinematic Ad Jobs: V3 fields
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS hook_variants jsonb,
  ADD COLUMN IF NOT EXISTS render_mode text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS quarantined_assets jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pin_publish_attempts integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_last_error text,
  ADD COLUMN IF NOT EXISTS publish_blocked_reason text,
  ADD COLUMN IF NOT EXISTS qa_composite_score numeric;

-- Settings: new thresholds + engine version
ALTER TABLE public.cinematic_ad_settings
  ADD COLUMN IF NOT EXISTS auto_repair_threshold integer DEFAULT 40,
  ADD COLUMN IF NOT EXISTS max_render_attempts integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS pinterest_publish_quality_floor integer DEFAULT 55,
  ADD COLUMN IF NOT EXISTS auto_publish_enabled boolean DEFAULT true;

-- Set v3 defaults on existing row
UPDATE public.cinematic_ad_settings
SET
  engine_version = COALESCE(engine_version, 'v3'),
  approval_confidence_threshold = LEAST(COALESCE(approval_confidence_threshold, 55), 55),
  auto_repair_threshold = COALESCE(auto_repair_threshold, 40),
  max_render_attempts = COALESCE(max_render_attempts, 5),
  pinterest_publish_quality_floor = COALESCE(pinterest_publish_quality_floor, 55),
  auto_publish_enabled = COALESCE(auto_publish_enabled, true)
WHERE id = true;

-- Index for publish queue lookups
CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_publishable
  ON public.cinematic_ad_jobs (status, qa_composite_score)
  WHERE status IN ('publishable', 'approved', 'completed', 'render_complete');
