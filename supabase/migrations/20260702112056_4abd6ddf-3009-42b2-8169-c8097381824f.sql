ALTER TABLE public.first_sales_certifications
  ADD COLUMN IF NOT EXISTS funnel jsonb,
  ADD COLUMN IF NOT EXISTS leaks jsonb,
  ADD COLUMN IF NOT EXISTS applied_fixes jsonb,
  ADD COLUMN IF NOT EXISTS opportunities jsonb,
  ADD COLUMN IF NOT EXISTS live_buyers jsonb,
  ADD COLUMN IF NOT EXISTS report_title text,
  ADD COLUMN IF NOT EXISTS report_version text;