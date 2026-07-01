
-- GENESIS V14 Phase 1 (retry — align with existing finance_alerts)

ALTER TABLE public.evidence_suppliers
  ADD COLUMN IF NOT EXISTS health_score smallint,
  ADD COLUMN IF NOT EXISTS risk_score smallint,
  ADD COLUMN IF NOT EXISTS invoice_completeness_pct smallint,
  ADD COLUMN IF NOT EXISTS spend_ytd_cents bigint,
  ADD COLUMN IF NOT EXISTS intelligence jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.finance_subscriptions
  ADD COLUMN IF NOT EXISTS duplicate_of uuid,
  ADD COLUMN IF NOT EXISTS unused_since date,
  ADD COLUMN IF NOT EXISTS expected_next_invoice_at date,
  ADD COLUMN IF NOT EXISTS missing_invoice_flag boolean DEFAULT false;

-- Extend existing finance_alerts with a subject linkage (nullable, additive)
ALTER TABLE public.finance_alerts
  ADD COLUMN IF NOT EXISTS subject_type text,
  ADD COLUMN IF NOT EXISTS subject_id uuid;

CREATE INDEX IF NOT EXISTS idx_finance_alerts_open
  ON public.finance_alerts(is_resolved, severity, created_at DESC);

-- finance_assets
CREATE TABLE IF NOT EXISTS public.finance_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('phone','laptop','desktop','tablet','monitor','server','network','printer','furniture','vehicle','camera','audio','storage','dev','other')),
  name text NOT NULL,
  serial text,
  supplier_id uuid REFERENCES public.evidence_suppliers(id) ON DELETE SET NULL,
  purchase_date date,
  purchase_amount_cents bigint,
  vat_amount_cents bigint,
  currency text DEFAULT 'EUR',
  business_usage_pct smallint DEFAULT 100 CHECK (business_usage_pct BETWEEN 0 AND 100),
  depreciation_method text DEFAULT 'linear' CHECK (depreciation_method IN ('linear','none')),
  depreciation_years smallint DEFAULT 5,
  salvage_value_cents bigint DEFAULT 0,
  asset_status text NOT NULL DEFAULT 'active' CHECK (asset_status IN ('active','repair','sold','retired','lost')),
  current_book_value_cents bigint,
  warranty_until date,
  replacement_expected_at date,
  notes text,
  photos jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_assets TO authenticated;
GRANT ALL ON public.finance_assets TO service_role;
ALTER TABLE public.finance_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage finance_assets" ON public.finance_assets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.finance_assets_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS finance_assets_touch ON public.finance_assets;
CREATE TRIGGER finance_assets_touch
  BEFORE UPDATE ON public.finance_assets
  FOR EACH ROW EXECUTE FUNCTION public.finance_assets_touch();

-- finance_asset_events
CREATE TABLE IF NOT EXISTS public.finance_asset_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.finance_assets(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('purchase','repair','warranty_claim','battery','upgrade','resale','replacement','note')),
  event_date date NOT NULL DEFAULT CURRENT_DATE,
  cost_cents bigint,
  vat_cents bigint,
  evidence_document_id uuid REFERENCES public.evidence_documents(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.evidence_suppliers(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_finance_asset_events_asset ON public.finance_asset_events(asset_id, event_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_asset_events TO authenticated;
GRANT ALL ON public.finance_asset_events TO service_role;
ALTER TABLE public.finance_asset_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage finance_asset_events" ON public.finance_asset_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- finance_asset_documents
CREATE TABLE IF NOT EXISTS public.finance_asset_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.finance_assets(id) ON DELETE CASCADE,
  evidence_document_id uuid NOT NULL REFERENCES public.evidence_documents(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('invoice','receipt','warranty','manual','photo','repair_receipt')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(asset_id, evidence_document_id, role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_asset_documents TO authenticated;
GRANT ALL ON public.finance_asset_documents TO service_role;
ALTER TABLE public.finance_asset_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage finance_asset_documents" ON public.finance_asset_documents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- finance_search_index
CREATE TABLE IF NOT EXISTS public.finance_search_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('document','supplier','asset','subscription','payment')),
  entity_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  tsv tsvector,
  metadata jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_finance_search_tsv ON public.finance_search_index USING GIN(tsv);

CREATE OR REPLACE FUNCTION public.finance_search_index_tsv_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.tsv := setweight(to_tsvector('simple', coalesce(NEW.title,'')), 'A')
          || setweight(to_tsvector('simple', coalesce(NEW.body,'')), 'B');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_search_index_tsv ON public.finance_search_index;
CREATE TRIGGER finance_search_index_tsv
  BEFORE INSERT OR UPDATE ON public.finance_search_index
  FOR EACH ROW EXECUTE FUNCTION public.finance_search_index_tsv_trigger();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_search_index TO authenticated;
GRANT ALL ON public.finance_search_index TO service_role;
ALTER TABLE public.finance_search_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage finance_search_index" ON public.finance_search_index
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
