
-- Add per-pin hard caps to run config
ALTER TABLE public.pinterest_run_config
  ADD COLUMN IF NOT EXISTS max_credit_spend_per_pin numeric(10,4) NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS max_paid_image_calls_per_pin int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_paid_qa_calls_per_image_hash int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_total_paid_calls int NOT NULL DEFAULT 3;

-- Runtime isolation flag: when set, cron-worker only publishes rows with matching run_id,
-- and legacy paid Pinterest edge functions refuse to run.
ALTER TABLE public.pinterest_runtime_settings
  ADD COLUMN IF NOT EXISTS wave_isolation_active_run_id uuid;

COMMENT ON COLUMN public.pinterest_runtime_settings.wave_isolation_active_run_id IS
  'When non-null, pinterest-cron-worker publishes ONLY rows with matching pinterest_pin_queue.run_id and all legacy paid AI Pinterest functions fail-closed until cleared.';
