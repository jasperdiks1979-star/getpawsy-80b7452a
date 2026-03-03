
ALTER TABLE public.merchant_sync_logs
  ADD COLUMN IF NOT EXISTS run_id text,
  ADD COLUMN IF NOT EXISTS mode text DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS raw_count integer,
  ADD COLUMN IF NOT EXISTS active_count integer,
  ADD COLUMN IF NOT EXISTS priced_count integer,
  ADD COLUMN IF NOT EXISTS eligible_count integer,
  ADD COLUMN IF NOT EXISTS payload_built_count integer,
  ADD COLUMN IF NOT EXISTS sent_count integer,
  ADD COLUMN IF NOT EXISTS top_failure_reasons jsonb,
  ADD COLUMN IF NOT EXISTS sample_failures jsonb,
  ADD COLUMN IF NOT EXISTS env_status jsonb,
  ADD COLUMN IF NOT EXISTS first10_payload_preview jsonb,
  ADD COLUMN IF NOT EXISTS errors jsonb,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS debug_report jsonb;
