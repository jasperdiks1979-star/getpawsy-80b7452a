-- Entities table
CREATE TABLE IF NOT EXISTS public.finance_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  trade_name text,
  country_code text NOT NULL DEFAULT 'NL',
  base_currency text NOT NULL DEFAULT 'EUR',
  vat_number text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.finance_entities TO authenticated;
GRANT ALL ON public.finance_entities TO service_role;

ALTER TABLE public.finance_entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_entities_read" ON public.finance_entities;
CREATE POLICY "finance_entities_read"
  ON public.finance_entities FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'accountant'::public.app_role)
    OR public.has_role(auth.uid(), 'finance'::public.app_role)
  );

INSERT INTO public.finance_entities (slug, legal_name, trade_name, country_code, base_currency, is_default)
VALUES ('skidzo', 'Skidzo', 'GetPawsy', 'NL', 'EUR', true)
ON CONFLICT (slug) DO NOTHING;

-- Add nullable entity_id to core transactional finance tables
ALTER TABLE public.evidence_documents          ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.finance_entities(id);
ALTER TABLE public.evidence_payments           ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.finance_entities(id);
ALTER TABLE public.finance_assets              ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.finance_entities(id);
ALTER TABLE public.finance_subscriptions       ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.finance_entities(id);
ALTER TABLE public.finance_reports             ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.finance_entities(id);
ALTER TABLE public.finance_vat_summaries       ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.finance_entities(id);
ALTER TABLE public.finance_vat_reconciliations ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.finance_entities(id);
ALTER TABLE public.finance_annual_dossiers     ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.finance_entities(id);
ALTER TABLE public.finance_import_tasks        ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.finance_entities(id);

CREATE INDEX IF NOT EXISTS idx_evidence_documents_entity    ON public.evidence_documents(entity_id);
CREATE INDEX IF NOT EXISTS idx_evidence_payments_entity     ON public.evidence_payments(entity_id);
CREATE INDEX IF NOT EXISTS idx_finance_assets_entity        ON public.finance_assets(entity_id);
CREATE INDEX IF NOT EXISTS idx_finance_subscriptions_entity ON public.finance_subscriptions(entity_id);

-- Security-definer helper: admin OR accountant OR finance
CREATE OR REPLACE FUNCTION public.has_finance_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::public.app_role, 'accountant'::public.app_role, 'finance'::public.app_role)
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_finance_access(uuid) TO authenticated;

-- Channel ROI view: daily revenue vs finance spend by supplier/provider
CREATE OR REPLACE VIEW public.v_finance_channel_roi AS
WITH revenue_by_day AS (
  SELECT
    date_trunc('day', created_at)::date AS day,
    COALESCE(SUM(total_amount), 0)::numeric AS revenue,
    COUNT(*)::bigint AS orders_count
  FROM public.orders
  WHERE status IN ('paid','completed','fulfilled')
  GROUP BY 1
),
spend_by_day AS (
  SELECT
    date_trunc('day', ep.paid_at)::date AS day,
    COALESCE(es.name, ep.provider, 'unknown') AS supplier,
    (SUM(ep.amount_minor)::numeric / 100.0) AS spend
  FROM public.evidence_payments ep
  LEFT JOIN public.evidence_suppliers es ON es.id = ep.supplier_id
  WHERE ep.paid_at IS NOT NULL
  GROUP BY 1, 2
)
SELECT
  COALESCE(s.day, r.day) AS day,
  COALESCE(s.supplier, 'no-spend') AS supplier,
  COALESCE(s.spend, 0)::numeric AS spend,
  COALESCE(r.revenue, 0)::numeric AS revenue,
  COALESCE(r.orders_count, 0) AS orders_count,
  CASE WHEN COALESCE(s.spend, 0) > 0
       THEN ROUND((r.revenue / s.spend)::numeric, 4)
       ELSE NULL END AS roas
FROM spend_by_day s
FULL OUTER JOIN revenue_by_day r ON r.day = s.day;

GRANT SELECT ON public.v_finance_channel_roi TO authenticated;