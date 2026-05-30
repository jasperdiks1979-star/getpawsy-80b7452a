ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS fidelity_report jsonb,
  ADD COLUMN IF NOT EXISTS fidelity_passed boolean,
  ADD COLUMN IF NOT EXISTS fidelity_score integer,
  ADD COLUMN IF NOT EXISTS fidelity_reject_reasons text[],
  ADD COLUMN IF NOT EXISTS scenes_needing_regen integer[],
  ADD COLUMN IF NOT EXISTS fidelity_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS fidelity_regen_passes integer NOT NULL DEFAULT 0;

ALTER TABLE public.cinematic_ad_settings
  ADD COLUMN IF NOT EXISTS product_fidelity_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_product_fidelity_score integer NOT NULL DEFAULT 75,
  ADD COLUMN IF NOT EXISTS fidelity_auto_regen boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fidelity_max_regen_passes integer NOT NULL DEFAULT 2;