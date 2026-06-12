-- =========================================================
-- Pinterest Conversion Validation Engine — schema
-- =========================================================

-- 1) pinterest_conversion_audit -----------------------------
CREATE TABLE IF NOT EXISTS public.pinterest_conversion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  pin_id uuid,
  pinterest_pin_id text,
  board_name text,
  board_id text,
  product_id uuid,
  product_slug text,
  destination_url text,
  final_url text,
  http_status integer,
  redirect_hops integer DEFAULT 0,
  inventory_status text,        -- in_stock | out_of_stock | unknown
  product_status text,          -- active | inactive | missing
  cart_status text,             -- ok | failed | skipped
  utm_intact boolean,
  utm_lost_keys text[] DEFAULT '{}'::text[],
  page_screenshot_url text,     -- reserved for future Playwright path
  cart_screenshot_url text,     -- reserved
  conversion_risk_score integer NOT NULL DEFAULT 0,
  risk_reasons text[] NOT NULL DEFAULT '{}'::text[],
  audit_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pca_run ON public.pinterest_conversion_audit(run_id);
CREATE INDEX IF NOT EXISTS idx_pca_pin ON public.pinterest_conversion_audit(pin_id);
CREATE INDEX IF NOT EXISTS idx_pca_risk ON public.pinterest_conversion_audit(conversion_risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_pca_date ON public.pinterest_conversion_audit(audit_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_conversion_audit TO authenticated;
GRANT ALL ON public.pinterest_conversion_audit TO service_role;
ALTER TABLE public.pinterest_conversion_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage conversion audit"
  ON public.pinterest_conversion_audit
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) pinterest_conversion_alerts ----------------------------
CREATE TABLE IF NOT EXISTS public.pinterest_conversion_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,     -- http_404 | product_inactive | zero_inventory | cart_broken | checkout_unavailable | utm_lost | broken_redirect | missing_image | orphan_product
  severity text NOT NULL DEFAULT 'warning',  -- info | warning | critical
  pin_id uuid,
  product_id uuid,
  product_slug text,
  destination_url text,
  details jsonb DEFAULT '{}'::jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  auto_closed boolean NOT NULL DEFAULT false,
  repair_action text,
  repair_log_id uuid,
  status text NOT NULL DEFAULT 'open'  -- open | repaired | closed
);
CREATE INDEX IF NOT EXISTS idx_pcal_status ON public.pinterest_conversion_alerts(status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcal_type ON public.pinterest_conversion_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_pcal_pin ON public.pinterest_conversion_alerts(pin_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_conversion_alerts TO authenticated;
GRANT ALL ON public.pinterest_conversion_alerts TO service_role;
ALTER TABLE public.pinterest_conversion_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage conversion alerts"
  ON public.pinterest_conversion_alerts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) pinterest_conversion_runs ------------------------------
CREATE TABLE IF NOT EXISTS public.pinterest_conversion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  trigger_source text NOT NULL DEFAULT 'cron', -- cron | manual | repair
  pins_total integer DEFAULT 0,
  pins_ready integer DEFAULT 0,
  pins_failed integer DEFAULT 0,
  pins_repaired integer DEFAULT 0,
  products_at_risk integer DEFAULT 0,
  broken_urls integer DEFAULT 0,
  redirect_issues integer DEFAULT 0,
  utm_failures integer DEFAULT 0,
  inventory_failures integer DEFAULT 0,
  cart_failures integer DEFAULT 0,
  alerts_opened integer DEFAULT 0,
  alerts_auto_closed integer DEFAULT 0,
  overall_score integer,                     -- 0-100
  status text DEFAULT 'running',             -- running | green | orange | red | error
  notes jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_pcr_started ON public.pinterest_conversion_runs(started_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_conversion_runs TO authenticated;
GRANT ALL ON public.pinterest_conversion_runs TO service_role;
ALTER TABLE public.pinterest_conversion_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage conversion runs"
  ON public.pinterest_conversion_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
