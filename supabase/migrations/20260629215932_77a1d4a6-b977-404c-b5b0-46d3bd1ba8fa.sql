
-- ============================================================
-- Genesis V3.4 — Self-Optimizing First Sale Engine
-- ============================================================

-- 1. Connector health table -----------------------------------
CREATE TABLE IF NOT EXISTS public.gv34_connector_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL UNIQUE,
  source_kind text,
  scheduler_ok boolean NOT NULL DEFAULT false,
  reachable boolean NOT NULL DEFAULT false,
  auth_ok boolean NOT NULL DEFAULT false,
  response_bytes integer,
  parsed_rows integer,
  dedupe_ok boolean,
  last_run_at timestamptz,
  last_signal_at timestamptz,
  error_step text,
  repair_action text,
  notes text,
  checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gv34_connector_health TO authenticated;
GRANT ALL ON public.gv34_connector_health TO service_role;
ALTER TABLE public.gv34_connector_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gv34_connector_health"
  ON public.gv34_connector_health FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Settings table -------------------------------------------
CREATE TABLE IF NOT EXISTS public.gv34_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.gv34_settings TO authenticated;
GRANT ALL ON public.gv34_settings TO service_role;
ALTER TABLE public.gv34_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read gv34_settings"
  ON public.gv34_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins write gv34_settings"
  ON public.gv34_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.gv34_settings(key, value)
VALUES ('first_sale_autonomous_mode', jsonb_build_object('enabled', false))
ON CONFLICT (key) DO NOTHING;

-- 3. Autopilot dedupe ----------------------------------------
ALTER TABLE public.autopilot_actions
  ADD COLUMN IF NOT EXISTS dedupe_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS autopilot_actions_dedupe_open_uidx
  ON public.autopilot_actions (kind, product_id, dedupe_hash)
  WHERE status IN ('queued','executing') AND dedupe_hash IS NOT NULL;

-- 4. First Sale Hunter view (rerank existing plan) ------------
DROP VIEW IF EXISTS public.gv34_first_sale_hunter_v CASCADE;
CREATE VIEW public.gv34_first_sale_hunter_v
WITH (security_invoker = true) AS
WITH recent_attempts AS (
  SELECT product_id, count(*) AS attempts_30d
  FROM public.autopilot_actions
  WHERE created_at > now() - interval '30 days'
  GROUP BY product_id
)
SELECT
  plan.product_id,
  plan.title,
  plan.handle,
  plan.price,
  plan.composite_score,
  plan.min_confidence,
  plan.expected_revenue_eur,
  plan.lane_probability,
  plan.lane_revenue,
  plan.lane_pinterest,
  plan.lane_google,
  plan.lane_impulse,
  plan.lane_urgency,
  COALESCE(p.us_stock,0)                  AS us_stock,
  COALESCE(p.is_us_warehouse,false)       AS is_us_warehouse,
  COALESCE(p.is_fast_shipping,false)      AS is_fast_shipping,
  COALESCE(p.shipping_score,0)            AS shipping_score,
  COALESCE(p.margin_percent,0)            AS margin_percent,
  COALESCE(ra.attempts_30d,0)             AS attempts_30d,
  -- final hunter rank: composite * confidence * inventory_ok * shipping_boost / attempt_fatigue
  (plan.composite_score
    * GREATEST(plan.min_confidence, 0.5)
    * CASE WHEN COALESCE(p.us_stock,0) > 0 THEN 1.0 ELSE 0.4 END
    * CASE WHEN COALESCE(p.is_fast_shipping,false) THEN 1.15 ELSE 1.0 END
    / (1 + COALESCE(ra.attempts_30d,0) * 0.15)
  ) AS hunter_score
FROM public.gv3_mi_first_sale_plan_v plan
LEFT JOIN public.products p ON p.id = plan.product_id
LEFT JOIN recent_attempts ra ON ra.product_id = plan.product_id;

GRANT SELECT ON public.gv34_first_sale_hunter_v TO authenticated;
GRANT SELECT ON public.gv34_first_sale_hunter_v TO service_role;

-- 5. AI Credit Efficiency view --------------------------------
DROP VIEW IF EXISTS public.gv34_ai_credit_efficiency_v CASCADE;
CREATE VIEW public.gv34_ai_credit_efficiency_v
WITH (security_invoker = true) AS
SELECT
  kind                                                              AS action_kind,
  count(*)                                                          AS executed_total,
  count(*) FILTER (WHERE status = 'succeeded')                      AS succeeded,
  count(*) FILTER (WHERE status = 'failed')                         AS failed,
  COALESCE(sum(ai_credit_cost),0)                                   AS credits_spent,
  COALESCE(sum(expected_revenue_eur),0)                             AS expected_revenue_eur,
  CASE WHEN COALESCE(sum(ai_credit_cost),0) > 0
       THEN COALESCE(sum(expected_revenue_eur),0) / sum(ai_credit_cost)
       ELSE 0 END                                                   AS revenue_per_credit,
  CASE WHEN count(*) > 0
       THEN count(*) FILTER (WHERE status='succeeded')::numeric / count(*)
       ELSE 0 END                                                   AS success_rate,
  max(created_at)                                                   AS last_executed_at
FROM public.autopilot_actions
WHERE executed_at IS NOT NULL
GROUP BY kind;

GRANT SELECT ON public.gv34_ai_credit_efficiency_v TO authenticated;
GRANT SELECT ON public.gv34_ai_credit_efficiency_v TO service_role;
