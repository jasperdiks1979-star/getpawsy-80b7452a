CREATE TABLE IF NOT EXISTS public.pcie2_migration_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taken_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  app_config jsonb NOT NULL,
  cron_jobs jsonb,
  queue_counts jsonb,
  flag_state jsonb,
  deployment_sha text,
  legacy_guard_status text,
  notes text
);
GRANT SELECT, INSERT ON public.pcie2_migration_snapshots TO authenticated;
GRANT ALL ON public.pcie2_migration_snapshots TO service_role;
ALTER TABLE public.pcie2_migration_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pcie2_snapshots_admin_read" ON public.pcie2_migration_snapshots;
CREATE POLICY "pcie2_snapshots_admin_read" ON public.pcie2_migration_snapshots FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "pcie2_snapshots_service_write" ON public.pcie2_migration_snapshots;
CREATE POLICY "pcie2_snapshots_service_write" ON public.pcie2_migration_snapshots FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.pcie2_pipeline_trace
  ADD COLUMN IF NOT EXISTS pipeline_id uuid,
  ADD COLUMN IF NOT EXISTS creative_id uuid,
  ADD COLUMN IF NOT EXISTS creative_version text,
  ADD COLUMN IF NOT EXISTS ai_model_version text,
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS similarity_score numeric,
  ADD COLUMN IF NOT EXISTS headline_version text,
  ADD COLUMN IF NOT EXISTS hook_version text,
  ADD COLUMN IF NOT EXISTS board_decision jsonb,
  ADD COLUMN IF NOT EXISTS publish_ts timestamptz,
  ADD COLUMN IF NOT EXISTS deployment_sha text,
  ADD COLUMN IF NOT EXISTS source_product_id uuid,
  ADD COLUMN IF NOT EXISTS quality_score numeric;

INSERT INTO public.pcie2_migration_snapshots (reason, app_config, queue_counts, flag_state, legacy_guard_status, notes)
SELECT
  'pre_migration_baseline_2026-06-26',
  (SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) FROM public.app_config),
  jsonb_build_object(
    'pinterest_pin_queue', (SELECT COALESCE(jsonb_object_agg(status, c), '{}'::jsonb) FROM (SELECT status, count(*) c FROM public.pinterest_pin_queue GROUP BY status) s),
    'pcie2_publish_queue', (SELECT count(*) FROM public.pcie2_publish_queue),
    'pinterest_pins_total', (SELECT count(*) FROM public.pinterest_pins)
  ),
  jsonb_build_object(
    'pcie2_publish_enabled', false,
    'pinterest_publishing_global_stop', true,
    'pcie2_headline_library_rows', (SELECT count(*) FROM public.pcie2_headline_library),
    'pcie2_hook_library_rows', (SELECT count(*) FROM public.pcie2_hook_library),
    'pcie2_creatives_rows', (SELECT count(*) FROM public.pcie2_creatives),
    'pcie2_pipeline_trace_rows', (SELECT count(*) FROM public.pcie2_pipeline_trace),
    'pcie2_product_understanding_rows', (SELECT count(*) FROM public.pcie2_product_understanding)
  ),
  'PASS',
  'Phase 4 baseline. Migration HALTED at Phase 2 (PCIE2 readiness FAIL: 0 headlines, 0 creatives, 0 traces, 0 perf). Canary not executed.';