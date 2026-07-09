
-- Tracking columns (idempotent)
ALTER TABLE public.pinterest_creative_factory_jobs
  ADD COLUMN IF NOT EXISTS recovery_wave_id uuid,
  ADD COLUMN IF NOT EXISTS recovery_generation integer NOT NULL DEFAULT 0;

ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS recovery_wave_id uuid,
  ADD COLUMN IF NOT EXISTS recovery_generation integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pcfj_recovery_wave ON public.pinterest_creative_factory_jobs(recovery_wave_id);
CREATE INDEX IF NOT EXISTS idx_ppq_recovery_wave ON public.pinterest_pin_queue(recovery_wave_id);

-- Waves
CREATE TABLE IF NOT EXISTS public.pinterest_wow_recovery_waves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wave_label text NOT NULL,
  triggered_by uuid,
  status text NOT NULL DEFAULT 'running',
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  jobs_scanned integer NOT NULL DEFAULT 0,
  jobs_regenerated integer NOT NULL DEFAULT 0,
  queue_regenerated integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT ON public.pinterest_wow_recovery_waves TO authenticated;
GRANT ALL ON public.pinterest_wow_recovery_waves TO service_role;
ALTER TABLE public.pinterest_wow_recovery_waves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read wow recovery waves"
  ON public.pinterest_wow_recovery_waves FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Audit
CREATE TABLE IF NOT EXISTS public.pinterest_wow_recovery_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wave_id uuid NOT NULL REFERENCES public.pinterest_wow_recovery_waves(id) ON DELETE CASCADE,
  target_type text NOT NULL,           -- 'factory_job' | 'pin_queue'
  target_id uuid NOT NULL,
  product_slug text,
  category_key text,
  original_failure text,
  failure_category text,
  strategy text NOT NULL,
  recovery_generation integer NOT NULL,
  adaptive_directives text,
  new_headline text,
  new_overlay text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_wow_recovery_audit TO authenticated;
GRANT ALL ON public.pinterest_wow_recovery_audit TO service_role;
ALTER TABLE public.pinterest_wow_recovery_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read wow recovery audit"
  ON public.pinterest_wow_recovery_audit FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Learnings (feeds Pinterest Native Intelligence)
CREATE TABLE IF NOT EXISTS public.pinterest_wow_recovery_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wave_id uuid REFERENCES public.pinterest_wow_recovery_waves(id) ON DELETE SET NULL,
  failure_category text NOT NULL,      -- pre_relevance_failed | visual_identity_failed | description_missing_getpawsy_destination | headline_cap_exceeded | creative_mismatch
  category_key text,
  banned_pattern text,                 -- exact phrase / headline / framing to avoid
  banned_pattern_type text NOT NULL,   -- 'headline' | 'overlay' | 'framing_directive' | 'vocab_omission'
  occurrences integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (failure_category, banned_pattern_type, banned_pattern)
);
GRANT SELECT ON public.pinterest_wow_recovery_learnings TO authenticated;
GRANT ALL ON public.pinterest_wow_recovery_learnings TO service_role;
ALTER TABLE public.pinterest_wow_recovery_learnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read wow recovery learnings"
  ON public.pinterest_wow_recovery_learnings FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
