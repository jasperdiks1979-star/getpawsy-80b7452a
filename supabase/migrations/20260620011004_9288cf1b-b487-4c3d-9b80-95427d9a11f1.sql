
-- Settings singleton
CREATE TABLE IF NOT EXISTS public.pinterest_pipeline_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  target_pins_per_day INTEGER NOT NULL DEFAULT 48,
  min_pins_per_day INTEGER NOT NULL DEFAULT 24,
  min_pending_videos INTEGER NOT NULL DEFAULT 20,
  min_pending_pins INTEGER NOT NULL DEFAULT 30,
  dead_video_minutes INTEGER NOT NULL DEFAULT 180,
  dead_pin_minutes INTEGER NOT NULL DEFAULT 180,
  recovery_score INTEGER NOT NULL DEFAULT 80,
  emergency_score INTEGER NOT NULL DEFAULT 60,
  emergency_mode_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  light_render_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  current_mode TEXT NOT NULL DEFAULT 'normal',
  current_health_score INTEGER NOT NULL DEFAULT 100,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pps_singleton CHECK (id = 1)
);
GRANT SELECT ON public.pinterest_pipeline_settings TO authenticated;
GRANT ALL ON public.pinterest_pipeline_settings TO service_role;
ALTER TABLE public.pinterest_pipeline_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read pps" ON public.pinterest_pipeline_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "service writes pps" ON public.pinterest_pipeline_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
INSERT INTO public.pinterest_pipeline_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Snapshots
CREATE TABLE IF NOT EXISTS public.pinterest_pipeline_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  videos_generated_24h INTEGER NOT NULL DEFAULT 0,
  pins_generated_24h INTEGER NOT NULL DEFAULT 0,
  pins_published_24h INTEGER NOT NULL DEFAULT 0,
  pending_videos INTEGER NOT NULL DEFAULT 0,
  pending_pins INTEGER NOT NULL DEFAULT 0,
  failed_24h INTEGER NOT NULL DEFAULT 0,
  recovered_24h INTEGER NOT NULL DEFAULT 0,
  avg_render_ms INTEGER,
  publish_rate_per_hour NUMERIC,
  last_video_at TIMESTAMPTZ,
  last_pin_at TIMESTAMPTZ,
  health_score INTEGER NOT NULL DEFAULT 100,
  mode TEXT NOT NULL DEFAULT 'normal',
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_pphs_created_at ON public.pinterest_pipeline_health_snapshots(created_at DESC);
GRANT SELECT ON public.pinterest_pipeline_health_snapshots TO authenticated;
GRANT ALL ON public.pinterest_pipeline_health_snapshots TO service_role;
ALTER TABLE public.pinterest_pipeline_health_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read pphs" ON public.pinterest_pipeline_health_snapshots FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "service writes pphs" ON public.pinterest_pipeline_health_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Failures
CREATE TABLE IF NOT EXISTS public.pinterest_pipeline_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL,
  job_type TEXT NOT NULL,
  job_id TEXT,
  error_code TEXT,
  error_message TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_ppf_retry ON public.pinterest_pipeline_failures(next_retry_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ppf_source ON public.pinterest_pipeline_failures(source, created_at DESC);
GRANT SELECT ON public.pinterest_pipeline_failures TO authenticated;
GRANT ALL ON public.pinterest_pipeline_failures TO service_role;
ALTER TABLE public.pinterest_pipeline_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read ppf" ON public.pinterest_pipeline_failures FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "service writes ppf" ON public.pinterest_pipeline_failures FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Recovery runs
CREATE TABLE IF NOT EXISTS public.pinterest_pipeline_recovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  trigger TEXT NOT NULL,
  outcome TEXT,
  health_before INTEGER,
  health_after INTEGER,
  checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_pprr_started ON public.pinterest_pipeline_recovery_runs(started_at DESC);
GRANT SELECT ON public.pinterest_pipeline_recovery_runs TO authenticated;
GRANT ALL ON public.pinterest_pipeline_recovery_runs TO service_role;
ALTER TABLE public.pinterest_pipeline_recovery_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read pprr" ON public.pinterest_pipeline_recovery_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "service writes pprr" ON public.pinterest_pipeline_recovery_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
