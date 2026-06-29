
ALTER TABLE public.cie_settings
  ADD COLUMN IF NOT EXISTS auto_repair_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_repair_dry_run boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_repair_max_per_cycle int NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS auto_repair_circuit_failures_1h int NOT NULL DEFAULT 5;

CREATE INDEX IF NOT EXISTS cie_auto_repairs_applied_at_idx
  ON public.cie_auto_repairs (applied_at DESC);

CREATE INDEX IF NOT EXISTS cie_attribution_incidents_status_idx
  ON public.cie_attribution_incidents (status, detected_at DESC);
