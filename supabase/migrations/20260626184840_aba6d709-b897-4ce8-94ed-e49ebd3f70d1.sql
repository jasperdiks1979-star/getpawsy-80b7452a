
CREATE TABLE IF NOT EXISTS public.pcie2_assembly_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  drafts_scanned int NOT NULL DEFAULT 0,
  passed int NOT NULL DEFAULT 0,
  repaired int NOT NULL DEFAULT 0,
  rejected int NOT NULL DEFAULT 0,
  skipped int NOT NULL DEFAULT 0,
  queued int NOT NULL DEFAULT 0,
  reason_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'running',
  notes text
);
GRANT SELECT ON public.pcie2_assembly_runs TO authenticated;
GRANT ALL ON public.pcie2_assembly_runs TO service_role;
ALTER TABLE public.pcie2_assembly_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY pcie2_assembly_runs_admin_read ON public.pcie2_assembly_runs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY pcie2_assembly_runs_service_all ON public.pcie2_assembly_runs TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pcie2_assembly_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pcie2_assembly_runs(id) ON DELETE CASCADE,
  creative_id uuid NOT NULL,
  product_id uuid,
  verdict text NOT NULL,
  reason text,
  detail text,
  queue_id uuid,
  board_id text,
  image_url text,
  destination_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcie2_asm_results_run ON public.pcie2_assembly_results(run_id);
CREATE INDEX IF NOT EXISTS idx_pcie2_asm_results_creative ON public.pcie2_assembly_results(creative_id);
CREATE INDEX IF NOT EXISTS idx_pcie2_asm_results_verdict ON public.pcie2_assembly_results(verdict);
GRANT SELECT ON public.pcie2_assembly_results TO authenticated;
GRANT ALL ON public.pcie2_assembly_results TO service_role;
ALTER TABLE public.pcie2_assembly_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY pcie2_assembly_results_admin_read ON public.pcie2_assembly_results FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY pcie2_assembly_results_service_all ON public.pcie2_assembly_results TO service_role USING (true) WITH CHECK (true);

-- Idempotency guard: prevent duplicate publish-ready queue rows for same product/board/image
CREATE UNIQUE INDEX IF NOT EXISTS pcie2_pq_idempotency_uidx
  ON public.pcie2_publish_queue (product_id, board_id, md5(coalesce(image_url,'')))
  WHERE status IN ('ready','queued','pending','publishing');
