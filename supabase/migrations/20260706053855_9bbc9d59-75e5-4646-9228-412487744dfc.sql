
-- Wave D2: Supplier Intelligence 2.0, Reconciliation, Subscription Intelligence
-- Additive only. Never overwrites existing data.

-- 1) Extend evidence_suppliers (additive columns)
ALTER TABLE public.evidence_suppliers
  ADD COLUMN IF NOT EXISTS expected_layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS expected_cycle text,
  ADD COLUMN IF NOT EXISTS expected_vat_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS expected_currency text,
  ADD COLUMN IF NOT EXISTS expected_bookkeeping_category text,
  ADD COLUMN IF NOT EXISTS avg_invoice_minor bigint,
  ADD COLUMN IF NOT EXISTS yoy_spend_minor bigint,
  ADD COLUMN IF NOT EXISTS missing_invoice_history integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicate_history integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS learned_patterns jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS confidence_score numeric(5,2),
  ADD COLUMN IF NOT EXISTS profile_last_computed_at timestamptz;

-- 2) Extend finance_subscriptions (additive columns)
ALTER TABLE public.finance_subscriptions
  ADD COLUMN IF NOT EXISTS cycle_detected text,
  ADD COLUMN IF NOT EXISTS price_trend text,
  ADD COLUMN IF NOT EXISTS forecast_annual_minor bigint,
  ADD COLUMN IF NOT EXISTS renewal_risk text,
  ADD COLUMN IF NOT EXISTS confidence_score numeric(5,2),
  ADD COLUMN IF NOT EXISTS reasoning jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS intel_last_computed_at timestamptz;

-- 3) finance_supplier_memory — learned rules from corrections
CREATE TABLE IF NOT EXISTS public.finance_supplier_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.evidence_suppliers(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  rule_value jsonb NOT NULL,
  confidence numeric(5,2) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'learned',
  reasoning text,
  observations integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, rule_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_supplier_memory TO authenticated;
GRANT ALL ON public.finance_supplier_memory TO service_role;

ALTER TABLE public.finance_supplier_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_memory_read" ON public.finance_supplier_memory
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'accountant'::app_role)
    OR has_role(auth.uid(), 'auditor'::app_role)
  );

CREATE POLICY "supplier_memory_admin_write" ON public.finance_supplier_memory
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_supplier_memory_supplier ON public.finance_supplier_memory (supplier_id);

-- 4) finance_reconciliation_matches — invoice ↔ payment links (versioned, reversible, never overwritten)
CREATE TABLE IF NOT EXISTS public.finance_reconciliation_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_document_id uuid REFERENCES public.evidence_documents(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.evidence_payments(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.evidence_suppliers(id) ON DELETE SET NULL,
  entity_id uuid REFERENCES public.finance_entities(id),
  match_type text NOT NULL,          -- exact | fuzzy | manual | ai
  match_status text NOT NULL DEFAULT 'proposed', -- proposed | accepted | rejected | superseded
  confidence numeric(5,2) NOT NULL DEFAULT 0,
  amount_delta_minor bigint,
  date_delta_days integer,
  match_signals jsonb NOT NULL DEFAULT '{}'::jsonb, -- {amount, currency, date, name, invoice_number, reference}
  reasoning text,
  reviewer_id uuid,
  reviewed_at timestamptz,
  superseded_by uuid,
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_reconciliation_matches TO authenticated;
GRANT ALL ON public.finance_reconciliation_matches TO service_role;

ALTER TABLE public.finance_reconciliation_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recon_read" ON public.finance_reconciliation_matches
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'accountant'::app_role)
    OR has_role(auth.uid(), 'auditor'::app_role)
  );

CREATE POLICY "recon_admin_write" ON public.finance_reconciliation_matches
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_recon_invoice ON public.finance_reconciliation_matches (invoice_document_id);
CREATE INDEX IF NOT EXISTS idx_recon_payment ON public.finance_reconciliation_matches (payment_id);
CREATE INDEX IF NOT EXISTS idx_recon_status ON public.finance_reconciliation_matches (match_status);

-- 5) updated_at triggers (reuse existing helper if present, else create local one)
CREATE OR REPLACE FUNCTION public.finance_d2_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_memory_updated ON public.finance_supplier_memory;
CREATE TRIGGER trg_supplier_memory_updated BEFORE UPDATE ON public.finance_supplier_memory
  FOR EACH ROW EXECUTE FUNCTION public.finance_d2_touch_updated_at();

DROP TRIGGER IF EXISTS trg_recon_updated ON public.finance_reconciliation_matches;
CREATE TRIGGER trg_recon_updated BEFORE UPDATE ON public.finance_reconciliation_matches
  FOR EACH ROW EXECUTE FUNCTION public.finance_d2_touch_updated_at();
