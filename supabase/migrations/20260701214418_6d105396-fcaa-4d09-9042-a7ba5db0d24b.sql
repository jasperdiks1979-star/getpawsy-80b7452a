
CREATE TABLE IF NOT EXISTS public.evidence_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  website TEXT,
  vat_number TEXT,
  country TEXT,
  currency TEXT DEFAULT 'USD',
  category TEXT,
  notes TEXT,
  invoice_count INT NOT NULL DEFAULT 0,
  total_paid_minor BIGINT NOT NULL DEFAULT 0,
  first_invoice_at TIMESTAMPTZ,
  latest_invoice_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence_suppliers TO authenticated;
GRANT ALL ON public.evidence_suppliers TO service_role;
ALTER TABLE public.evidence_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage suppliers" ON public.evidence_suppliers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "accountant auditor read suppliers" ON public.evidence_suppliers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'accountant'::public.app_role) OR public.has_role(auth.uid(),'auditor'::public.app_role));

CREATE TABLE IF NOT EXISTS public.evidence_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  document_type TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  supplier_id UUID REFERENCES public.evidence_suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  document_date DATE,
  period_start DATE,
  period_end DATE,
  invoice_number TEXT,
  reference TEXT,
  amount_minor BIGINT,
  currency TEXT,
  vat_minor BIGINT,
  tax_country TEXT,
  original_filename TEXT,
  mime_type TEXT,
  file_size BIGINT,
  sha256 TEXT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'evidence-vault',
  storage_path TEXT,
  public_path TEXT,
  source TEXT,
  uploader UUID,
  version INT NOT NULL DEFAULT 1,
  supersedes UUID REFERENCES public.evidence_documents(id) ON DELETE SET NULL,
  is_immutable BOOLEAN NOT NULL DEFAULT true,
  is_duplicate_of UUID REFERENCES public.evidence_documents(id) ON DELETE SET NULL,
  ocr_text TEXT,
  ocr_status TEXT NOT NULL DEFAULT 'pending',
  classification TEXT,
  classification_confidence NUMERIC,
  tags TEXT[] NOT NULL DEFAULT '{}',
  integrity_verified BOOLEAN NOT NULL DEFAULT false,
  last_verified TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  search_vector tsvector,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_documents_sha ON public.evidence_documents(sha256);
CREATE INDEX IF NOT EXISTS evidence_documents_supplier ON public.evidence_documents(supplier_id);
CREATE INDEX IF NOT EXISTS evidence_documents_date ON public.evidence_documents(document_date DESC);
CREATE INDEX IF NOT EXISTS evidence_documents_category ON public.evidence_documents(category);
CREATE INDEX IF NOT EXISTS evidence_documents_search ON public.evidence_documents USING gin(search_vector);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence_documents TO authenticated;
GRANT ALL ON public.evidence_documents TO service_role;
ALTER TABLE public.evidence_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage evidence" ON public.evidence_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "accountant auditor read evidence" ON public.evidence_documents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'accountant'::public.app_role) OR public.has_role(auth.uid(),'auditor'::public.app_role));

CREATE OR REPLACE FUNCTION public.evidence_documents_tsv() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.supplier_name,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.invoice_number,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.description,'')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.ocr_text,'')), 'D') ||
    setweight(to_tsvector('simple', array_to_string(coalesce(NEW.tags,'{}'::text[]),' ')), 'B');
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_evidence_documents_tsv ON public.evidence_documents;
CREATE TRIGGER trg_evidence_documents_tsv BEFORE INSERT OR UPDATE ON public.evidence_documents
  FOR EACH ROW EXECUTE FUNCTION public.evidence_documents_tsv();

CREATE TABLE IF NOT EXISTS public.evidence_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES public.evidence_suppliers(id) ON DELETE SET NULL,
  invoice_document_id UUID REFERENCES public.evidence_documents(id) ON DELETE SET NULL,
  receipt_document_id UUID REFERENCES public.evidence_documents(id) ON DELETE SET NULL,
  bank_txn_reference TEXT,
  provider TEXT,
  amount_minor BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  vat_minor BIGINT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'confirmed',
  paid_at TIMESTAMPTZ,
  sha256 TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence_payments TO authenticated;
GRANT ALL ON public.evidence_payments TO service_role;
ALTER TABLE public.evidence_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage payments" ON public.evidence_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "accountant auditor read payments" ON public.evidence_payments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'accountant'::public.app_role) OR public.has_role(auth.uid(),'auditor'::public.app_role));

CREATE TABLE IF NOT EXISTS public.evidence_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.genesis_documents(id) ON DELETE CASCADE,
  evidence_id UUID REFERENCES public.evidence_documents(id) ON DELETE CASCADE,
  related_report_id UUID REFERENCES public.genesis_documents(id) ON DELETE CASCADE,
  related_evidence_id UUID REFERENCES public.evidence_documents(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT 'supports',
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_links_report ON public.evidence_links(report_id);
CREATE INDEX IF NOT EXISTS evidence_links_evidence ON public.evidence_links(evidence_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence_links TO authenticated;
GRANT ALL ON public.evidence_links TO service_role;
ALTER TABLE public.evidence_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage links" ON public.evidence_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "accountant auditor read links" ON public.evidence_links FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'accountant'::public.app_role) OR public.has_role(auth.uid(),'auditor'::public.app_role));

CREATE TABLE IF NOT EXISTS public.evidence_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_at TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  evidence_id UUID REFERENCES public.evidence_documents(id) ON DELETE SET NULL,
  report_id UUID REFERENCES public.genesis_documents(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.evidence_payments(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.evidence_suppliers(id) ON DELETE SET NULL,
  amount_minor BIGINT,
  currency TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_timeline_at ON public.evidence_timeline(event_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence_timeline TO authenticated;
GRANT ALL ON public.evidence_timeline TO service_role;
ALTER TABLE public.evidence_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage timeline" ON public.evidence_timeline FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "accountant auditor read timeline" ON public.evidence_timeline FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'accountant'::public.app_role) OR public.has_role(auth.uid(),'auditor'::public.app_role));

CREATE TABLE IF NOT EXISTS public.evidence_backup_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  documents_checked INT NOT NULL DEFAULT 0,
  documents_missing INT NOT NULL DEFAULT 0,
  hash_mismatches INT NOT NULL DEFAULT 0,
  broken_links INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',
  details JSONB NOT NULL DEFAULT '{}'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence_backup_checks TO authenticated;
GRANT ALL ON public.evidence_backup_checks TO service_role;
ALTER TABLE public.evidence_backup_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins backup checks" ON public.evidence_backup_checks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "accountant auditor read backup" ON public.evidence_backup_checks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'accountant'::public.app_role) OR public.has_role(auth.uid(),'auditor'::public.app_role));
