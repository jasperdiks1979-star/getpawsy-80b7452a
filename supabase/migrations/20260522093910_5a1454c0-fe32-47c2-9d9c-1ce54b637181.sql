
-- Settings: humanization + recovery tier progression
ALTER TABLE public.cinematic_ad_settings
  ADD COLUMN IF NOT EXISTS publish_windows_est jsonb NOT NULL DEFAULT '[{"start":7,"end":9},{"start":12,"end":14},{"start":19,"end":23}]'::jsonb,
  ADD COLUMN IF NOT EXISTS publish_jitter_min_seconds int NOT NULL DEFAULT 420,
  ADD COLUMN IF NOT EXISTS publish_jitter_max_seconds int NOT NULL DEFAULT 2700,
  ADD COLUMN IF NOT EXISTS recovery_auto_exit_days int NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS recovery_tier_progression jsonb NOT NULL DEFAULT '{"tier1":2,"tier2":3,"tier3":4}'::jsonb,
  ADD COLUMN IF NOT EXISTS hook_cooldown_days int NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS thumbnail_phash_distance_threshold int NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS board_recent_window_minutes int NOT NULL DEFAULT 720,
  ADD COLUMN IF NOT EXISTS board_max_pins_per_window int NOT NULL DEFAULT 2;

-- Jobs: dedupe hashes, archetype, scheduling, QA breakdown
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS thumbnail_phash text,
  ADD COLUMN IF NOT EXISTS first3s_phash text,
  ADD COLUMN IF NOT EXISTS overlay_text_hash text,
  ADD COLUMN IF NOT EXISTS hook_archetype text,
  ADD COLUMN IF NOT EXISTS scheduled_publish_at timestamptz,
  ADD COLUMN IF NOT EXISTS humanization_seed text,
  ADD COLUMN IF NOT EXISTS qa_breakdown jsonb;

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_thumb_phash ON public.cinematic_ad_jobs (thumbnail_phash) WHERE thumbnail_phash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_hook_archetype ON public.cinematic_ad_jobs (hook_archetype, created_at DESC) WHERE hook_archetype IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_scheduled ON public.cinematic_ad_jobs (scheduled_publish_at) WHERE scheduled_publish_at IS NOT NULL;

-- Performance memory
CREATE TABLE IF NOT EXISTS public.cinematic_pin_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id text NOT NULL,
  asset_id uuid,
  job_id uuid,
  hook_archetype text,
  board_id text,
  outbound_clicks int NOT NULL DEFAULT 0,
  saves int NOT NULL DEFAULT 0,
  impressions int NOT NULL DEFAULT 0,
  watch_seconds_p50 numeric,
  engagement_rate numeric,
  collected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pin_id, collected_at)
);
CREATE INDEX IF NOT EXISTS idx_cinematic_pin_perf_hook ON public.cinematic_pin_performance (hook_archetype, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_cinematic_pin_perf_board ON public.cinematic_pin_performance (board_id, collected_at DESC);
ALTER TABLE public.cinematic_pin_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read cinematic_pin_performance"
  ON public.cinematic_pin_performance FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service role write cinematic_pin_performance"
  ON public.cinematic_pin_performance FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Quarantine patterns
CREATE TABLE IF NOT EXISTS public.cinematic_quarantine_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type text NOT NULL CHECK (pattern_type IN ('hook','storyboard','thumbnail_phash','board','overlay_text')),
  pattern_value text NOT NULL,
  reason text,
  quarantined_until timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pattern_type, pattern_value)
);
CREATE INDEX IF NOT EXISTS idx_cinematic_quarantine_active ON public.cinematic_quarantine_patterns (pattern_type, quarantined_until);
ALTER TABLE public.cinematic_quarantine_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage cinematic_quarantine_patterns"
  ON public.cinematic_quarantine_patterns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service role write cinematic_quarantine_patterns"
  ON public.cinematic_quarantine_patterns FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Humanization pools
CREATE TABLE IF NOT EXISTS public.cinematic_humanization_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_type text NOT NULL CHECK (pool_type IN ('caption_template','cta','hashtag_group','opener')),
  variants jsonb NOT NULL,
  weights jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cinematic_humanization_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage cinematic_humanization_pools"
  ON public.cinematic_humanization_pools FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service role read cinematic_humanization_pools"
  ON public.cinematic_humanization_pools FOR SELECT TO service_role
  USING (true);
