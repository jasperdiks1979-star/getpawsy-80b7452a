
-- Wave D1: Forensic Document + VAT Core (additive only)

-- 1) Extend evidence_documents with forensic accounting fields (all nullable)
ALTER TABLE public.evidence_documents
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS kvk text,
  ADD COLUMN IF NOT EXISTS po_number text,
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS fx_rate numeric,
  ADD COLUMN IF NOT EXISTS subtotal_minor bigint,
  ADD COLUMN IF NOT EXISTS vat_pct numeric,
  ADD COLUMN IF NOT EXISTS total_minor bigint,
  ADD COLUMN IF NOT EXISTS reverse_charge boolean,
  ADD COLUMN IF NOT EXISTS import_vat_minor bigint,
  ADD COLUMN IF NOT EXISTS non_deductible_vat_minor bigint,
  ADD COLUMN IF NOT EXISTS recoverable_vat_minor bigint,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS bookkeeping_category text,
  ADD COLUMN IF NOT EXISTS expense_category text,
  ADD COLUMN IF NOT EXISTS ocr_confidence numeric,
  ADD COLUMN IF NOT EXISTS extraction_confidence numeric,
  ADD COLUMN IF NOT EXISTS missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS validation_state text,
  ADD COLUMN IF NOT EXISTS bookkeeping_readiness text,
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS quality_reasons jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) Versioned raw extractions (never overwrite; append-only)
CREATE TABLE IF NOT EXISTS public.finance_document_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.evidence_documents(id) ON DELETE CASCADE,
  document_version integer NOT NULL DEFAULT 1,
  extractor text NOT NULL,
  model text,
  raw_extraction jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric,
  reasoning jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_document_extractions_doc ON public.finance_document_extractions(document_id, created_at DESC);

GRANT SELECT ON public.finance_document_extractions TO authenticated;
GRANT ALL ON public.finance_document_extractions TO service_role;
ALTER TABLE public.finance_document_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance staff read extractions"
  ON public.finance_document_extractions FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'accountant'::app_role)
    OR has_role(auth.uid(), 'auditor'::app_role)
  );

-- 3) VAT classification per document
CREATE TABLE IF NOT EXISTS public.finance_vat_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.evidence_documents(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES public.finance_entities(id),
  bucket text NOT NULL,
  vat_pct numeric,
  vat_minor bigint,
  recoverable_minor bigint,
  non_deductible_minor bigint,
  reverse_charge boolean NOT NULL DEFAULT false,
  import_vat boolean NOT NULL DEFAULT false,
  oss boolean NOT NULL DEFAULT false,
  outside_eu boolean NOT NULL DEFAULT false,
  mixed boolean NOT NULL DEFAULT false,
  private_use_pct numeric,
  country text,
  quarter text,
  fiscal_year integer,
  confidence numeric,
  reasoning jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'finance-vat-classify',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id)
);
CREATE INDEX IF NOT EXISTS finance_vat_class_entity_q ON public.finance_vat_classifications(entity_id, fiscal_year, quarter);

GRANT SELECT ON public.finance_vat_classifications TO authenticated;
GRANT ALL ON public.finance_vat_classifications TO service_role;
ALTER TABLE public.finance_vat_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance staff read vat class"
  ON public.finance_vat_classifications FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'accountant'::app_role)
    OR has_role(auth.uid(), 'auditor'::app_role)
  );

-- 4) Invoice quality (15-check forensic score)
CREATE TABLE IF NOT EXISTS public.finance_invoice_quality (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.evidence_documents(id) ON DELETE CASCADE,
  score numeric NOT NULL,
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id)
);
CREATE INDEX IF NOT EXISTS finance_invoice_quality_score ON public.finance_invoice_quality(score);

GRANT SELECT ON public.finance_invoice_quality TO authenticated;
GRANT ALL ON public.finance_invoice_quality TO service_role;
ALTER TABLE public.finance_invoice_quality ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance staff read invoice quality"
  ON public.finance_invoice_quality FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'accountant'::app_role)
    OR has_role(auth.uid(), 'auditor'::app_role)
  );

-- 5) updated_at trigger for vat classifications
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_vat_class_updated ON public.finance_vat_classifications;
CREATE TRIGGER trg_finance_vat_class_updated
  BEFORE UPDATE ON public.finance_vat_classifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
