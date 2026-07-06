
-- Wave D4: corrections log + queued import worker path + accountant export jobs

CREATE TABLE IF NOT EXISTS public.finance_corrections_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,       -- 'supplier'|'vat'|'category'|'entity'|'payment_match'|'subscription'|'bookkeeping'|'private_business'
  entity_id uuid,                  -- id of edited row (nullable for freeform)
  supplier_id uuid REFERENCES public.evidence_suppliers(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.evidence_documents(id) ON DELETE SET NULL,
  field text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  reason text,
  confidence_before numeric,
  confidence_after numeric,
  corrected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_to_memory boolean NOT NULL DEFAULT false,
  applied_at timestamptz,
  reverted boolean NOT NULL DEFAULT false,
  reverted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fcl_entity ON public.finance_corrections_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_fcl_supplier ON public.finance_corrections_log(supplier_id);
CREATE INDEX IF NOT EXISTS idx_fcl_created ON public.finance_corrections_log(created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.finance_corrections_log TO authenticated;
GRANT ALL ON public.finance_corrections_log TO service_role;
ALTER TABLE public.finance_corrections_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_corrections_log_read" ON public.finance_corrections_log
  FOR SELECT TO authenticated USING (public.has_finance_access(auth.uid()));
CREATE POLICY "finance_corrections_log_write" ON public.finance_corrections_log
  FOR INSERT TO authenticated WITH CHECK (public.has_finance_access(auth.uid()));
CREATE POLICY "finance_corrections_log_update" ON public.finance_corrections_log
  FOR UPDATE TO authenticated USING (public.has_finance_access(auth.uid()));

-- Queued worker path for large imports
CREATE TABLE IF NOT EXISTS public.finance_import_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  source text NOT NULL,               -- 'zip'|'pdf'|'email'|'manual'
  source_uri text,                    -- storage path or url
  source_filename text,
  content_sha256 text,                -- idempotency key
  status text NOT NULL DEFAULT 'queued',  -- queued|running|success|failed|skipped_duplicate
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  last_error text,
  document_id uuid REFERENCES public.evidence_documents(id) ON DELETE SET NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fiq_sha_unique
  ON public.finance_import_queue(content_sha256)
  WHERE content_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fiq_batch ON public.finance_import_queue(batch_id);
CREATE INDEX IF NOT EXISTS idx_fiq_status ON public.finance_import_queue(status);

GRANT SELECT, INSERT, UPDATE ON public.finance_import_queue TO authenticated;
GRANT ALL ON public.finance_import_queue TO service_role;
ALTER TABLE public.finance_import_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_import_queue_read" ON public.finance_import_queue
  FOR SELECT TO authenticated USING (public.has_finance_access(auth.uid()));
CREATE POLICY "finance_import_queue_write" ON public.finance_import_queue
  FOR INSERT TO authenticated WITH CHECK (public.has_finance_access(auth.uid()));
CREATE POLICY "finance_import_queue_update" ON public.finance_import_queue
  FOR UPDATE TO authenticated USING (public.has_finance_access(auth.uid()));

-- Accountant export jobs (audit trail of generated packages)
CREATE TABLE IF NOT EXISTS public.finance_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_type text NOT NULL,         -- 'excel'|'csv'|'pdf'|'json'|'audit_package'|'vat_quarter'|'missing_evidence'
  entity_id uuid,
  period_year int,
  period_quarter int,
  status text NOT NULL DEFAULT 'queued',  -- queued|running|success|failed
  row_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb,                     -- json export inline; for excel/pdf we return download link in payload
  storage_path text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_fej_created ON public.finance_export_jobs(created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.finance_export_jobs TO authenticated;
GRANT ALL ON public.finance_export_jobs TO service_role;
ALTER TABLE public.finance_export_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_export_jobs_read" ON public.finance_export_jobs
  FOR SELECT TO authenticated USING (public.has_finance_access(auth.uid()));
CREATE POLICY "finance_export_jobs_write" ON public.finance_export_jobs
  FOR INSERT TO authenticated WITH CHECK (public.has_finance_access(auth.uid()));
CREATE POLICY "finance_export_jobs_update" ON public.finance_export_jobs
  FOR UPDATE TO authenticated USING (public.has_finance_access(auth.uid()));
