
-- VAT reconciliation storage
CREATE TABLE IF NOT EXISTS public.finance_vat_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type text NOT NULL CHECK (period_type IN ('quarter','year')),
  period_year int NOT NULL,
  period_number int,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','warning','discrepancy','error')),
  currency text NOT NULL DEFAULT 'EUR',
  imported_vat_minor bigint NOT NULL DEFAULT 0,
  calculated_vat_minor bigint NOT NULL DEFAULT 0,
  delta_minor bigint NOT NULL DEFAULT 0,
  delta_pct numeric NOT NULL DEFAULT 0,
  invoice_count int NOT NULL DEFAULT 0,
  missing_docs int NOT NULL DEFAULT 0,
  flagged_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_sha256 text,
  evidence_document_id uuid REFERENCES public.evidence_documents(id) ON DELETE SET NULL,
  triggered_by text NOT NULL DEFAULT 'cron',
  notes text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_type, period_year, period_number, created_at)
);

GRANT SELECT ON public.finance_vat_reconciliations TO authenticated;
GRANT ALL ON public.finance_vat_reconciliations TO service_role;

ALTER TABLE public.finance_vat_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vat_recon_read"
  ON public.finance_vat_reconciliations FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'auditor'));

CREATE POLICY "vat_recon_admin_write"
  ON public.finance_vat_reconciliations FOR ALL
  TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

CREATE INDEX finance_vat_recon_period ON public.finance_vat_reconciliations (period_year DESC, period_number DESC);
CREATE INDEX finance_vat_recon_status ON public.finance_vat_reconciliations (status);

CREATE TRIGGER trg_finance_vat_recon_updated
  BEFORE UPDATE ON public.finance_vat_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
