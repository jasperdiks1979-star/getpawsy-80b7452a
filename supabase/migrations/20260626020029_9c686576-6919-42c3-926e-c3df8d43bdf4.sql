
DO $$ BEGIN
  CREATE TYPE public.pcie2_module_status AS ENUM ('passed','failed','skipped','warning');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pcie2_reject_reason AS ENUM (
    'irrelevant_headline','cj_product_photo','duplicate_creative',
    'low_quality_score','wrong_category','similarity_gate_fail',
    'classification_missing','hook_missing','headline_missing',
    'creative_brief_missing','global_stop','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.pcie2_pipeline_trace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id UUID NOT NULL,
  pin_queue_id UUID NULL,
  product_id UUID NULL,
  module TEXT NOT NULL,
  module_version TEXT NOT NULL DEFAULT 'v1',
  status public.pcie2_module_status NOT NULL,
  reject_reason public.pcie2_reject_reason NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_ms INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pcie2_pipeline_trace TO authenticated;
GRANT ALL ON public.pcie2_pipeline_trace TO service_role;
CREATE INDEX IF NOT EXISTS pcie2_pipeline_trace_trace_id_idx ON public.pcie2_pipeline_trace(trace_id);
CREATE INDEX IF NOT EXISTS pcie2_pipeline_trace_product_id_idx ON public.pcie2_pipeline_trace(product_id);
CREATE INDEX IF NOT EXISTS pcie2_pipeline_trace_created_at_idx ON public.pcie2_pipeline_trace(created_at DESC);
ALTER TABLE public.pcie2_pipeline_trace ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pcie2_trace_admin_read ON public.pcie2_pipeline_trace;
CREATE POLICY pcie2_trace_admin_read ON public.pcie2_pipeline_trace
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS pcie2_trace_service_all ON public.pcie2_pipeline_trace;
CREATE POLICY pcie2_trace_service_all ON public.pcie2_pipeline_trace
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pcie2_publish_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  trace_id UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending',
  headline TEXT NULL,
  hook TEXT NULL,
  category TEXT NULL,
  image_url TEXT NULL,
  board_id TEXT NULL,
  quality_score NUMERIC NULL,
  pinterest_pin_id TEXT NULL,
  rejected_reason public.pcie2_reject_reason NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at TIMESTAMPTZ NULL
);
GRANT SELECT ON public.pcie2_publish_queue TO authenticated;
GRANT ALL ON public.pcie2_publish_queue TO service_role;
CREATE INDEX IF NOT EXISTS pcie2_publish_queue_status_idx ON public.pcie2_publish_queue(status);
CREATE INDEX IF NOT EXISTS pcie2_publish_queue_product_idx ON public.pcie2_publish_queue(product_id);
ALTER TABLE public.pcie2_publish_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pcie2_queue_admin_read ON public.pcie2_publish_queue;
CREATE POLICY pcie2_queue_admin_read ON public.pcie2_publish_queue
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS pcie2_queue_service_all ON public.pcie2_publish_queue;
CREATE POLICY pcie2_queue_service_all ON public.pcie2_publish_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX IF NOT EXISTS pcie2_legacy_inventory_category_name_idx
  ON public.pcie2_legacy_inventory(category, name);

INSERT INTO public.pcie2_legacy_inventory(category, name, neutralized, neutralized_via, detail) VALUES
  ('edge_function','pinterest-automation',true,'pcie2_global_stop_guard','{"notes":"PCIE2_GLOBAL_STOP guard active in publishSelectedPin"}'::jsonb),
  ('edge_function','pinterest-publish-now',true,'pcie2_global_stop_guard','{"notes":"PCIE2_GLOBAL_STOP guard at serve entry"}'::jsonb),
  ('edge_function','pinterest-video-publisher',true,'pcie2_global_stop_guard','{"notes":"PCIE2_GLOBAL_STOP guard on publish actions"}'::jsonb),
  ('edge_function','pinterest-live-pin-repair-execute',true,'pcie2_global_stop_guard','{"notes":"PCIE2_GLOBAL_STOP guard pre-POST"}'::jsonb),
  ('edge_function','pinterest-scheduler',true,'performance_mode_lockdown','{"notes":"Legacy auto-scheduler returns PERFORMANCE_MODE_LOCKDOWN"}'::jsonb),
  ('edge_function','pinterest-regen-autopilot',true,'pcie2_global_stop_guard','{"notes":"PCIE2_GLOBAL_STOP guard at serve entry"}'::jsonb),
  ('edge_function','pinterest-revenue-autopilot',true,'pcie2_global_stop_guard','{"notes":"PCIE2_GLOBAL_STOP guard at serve entry"}'::jsonb),
  ('edge_function','pinterest-autopilot-watchdog',true,'pcie2_global_stop_guard','{"notes":"PCIE2_GLOBAL_STOP guard at serve entry"}'::jsonb),
  ('edge_function','pinterest-content-correction',true,'pcie2_global_stop_guard','{"notes":"PCIE2_GLOBAL_STOP guard at serve entry"}'::jsonb),
  ('cron','pinterest-daily-scheduler',true,'cron_unscheduled','{"notes":"Unscheduled 2026-06-26"}'::jsonb),
  ('cron','pinterest-regen-autopilot-30m',true,'cron_unscheduled','{"notes":"Unscheduled 2026-06-26"}'::jsonb),
  ('cron','pinterest-revenue-autopilot-hourly',true,'cron_unscheduled','{"notes":"Unscheduled 2026-06-26"}'::jsonb),
  ('cron','pinterest-autopilot-watchdog-10min',true,'cron_unscheduled','{"notes":"Unscheduled 2026-06-26"}'::jsonb),
  ('cron','pinterest-content-correction-autosweep',true,'cron_unscheduled','{"notes":"Unscheduled 2026-06-26"}'::jsonb),
  ('cron','growth-publish-tick-15min',true,'cron_unscheduled','{"notes":"Unscheduled in earlier wave"}'::jsonb),
  ('cron','pinterest-cron-publish',true,'cron_unscheduled','{"notes":"Unscheduled in earlier wave"}'::jsonb)
ON CONFLICT (category, name) DO UPDATE
  SET neutralized = EXCLUDED.neutralized,
      neutralized_via = EXCLUDED.neutralized_via,
      detail = EXCLUDED.detail,
      recorded_at = now();

INSERT INTO public.app_config(key, value) VALUES
  ('pinterest_publishing_global_stop', 'true'::jsonb),
  ('pcie2_publish_enabled', 'false'::jsonb),
  ('pcie2_pipeline_version', '"1.0.0"'::jsonb)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();
