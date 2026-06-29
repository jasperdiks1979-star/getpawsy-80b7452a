
-- ============================================================================
-- Genesis V2.6 — Canonical Analytics single-source-of-truth layer (fixed)
-- ============================================================================

CREATE OR REPLACE VIEW public.canonical_orders WITH (security_invoker = on) AS
SELECT
  o.id                AS order_id,
  o.stripe_session_id,
  o.ga_client_id,
  o.total_amount,
  o.currency,
  o.status,
  o.created_at        AS paid_at,
  ce.session_id,
  ce.utm_source, ce.utm_medium, ce.utm_campaign,
  ce.country, ce.device
FROM public.orders o
LEFT JOIN LATERAL (
  SELECT * FROM public.canonical_events e
  WHERE e.order_id = o.id
     OR (e.stripe_session_id IS NOT NULL AND e.stripe_session_id = o.stripe_session_id)
  ORDER BY e.occurred_at ASC
  LIMIT 1
) ce ON TRUE
WHERE o.status = 'paid';

CREATE OR REPLACE VIEW public.canonical_funnel WITH (security_invoker = on) AS
SELECT
  s.session_id,
  s.first_seen_at, s.last_seen_at,
  s.utm_source, s.utm_medium, s.utm_campaign,
  s.country, s.device,
  bool_or(e.canonical_name = 'CANONICAL_PAGE_VIEW')    AS reached_page_view,
  bool_or(e.canonical_name = 'CANONICAL_PRODUCT_VIEW') AS reached_product_view,
  bool_or(e.canonical_name = 'CANONICAL_ADD_TO_CART')  AS reached_add_to_cart,
  bool_or(e.canonical_name = 'CANONICAL_CART')         AS reached_cart,
  bool_or(e.canonical_name = 'CANONICAL_CHECKOUT')     AS reached_checkout,
  bool_or(e.canonical_name = 'CANONICAL_PURCHASE')     AS reached_purchase,
  s.order_id, s.stripe_session_id
FROM public.canonical_sessions s
LEFT JOIN public.canonical_events e USING (session_id)
GROUP BY s.session_id, s.first_seen_at, s.last_seen_at, s.utm_source, s.utm_medium,
         s.utm_campaign, s.country, s.device, s.order_id, s.stripe_session_id;

CREATE OR REPLACE VIEW public.canonical_products WITH (security_invoker = on) AS
SELECT
  date_trunc('day', occurred_at)::date AS day,
  product_id,
  count(*) FILTER (WHERE canonical_name = 'CANONICAL_PRODUCT_VIEW') AS product_views,
  count(*) FILTER (WHERE canonical_name = 'CANONICAL_ADD_TO_CART')  AS add_to_carts,
  count(*) FILTER (WHERE canonical_name = 'CANONICAL_CHECKOUT')     AS checkouts,
  count(*) FILTER (WHERE canonical_name = 'CANONICAL_PURCHASE')     AS purchases,
  coalesce(sum(value_cents) FILTER (WHERE canonical_name = 'CANONICAL_PURCHASE'),0) AS revenue_cents
FROM public.canonical_events
WHERE product_id IS NOT NULL
GROUP BY 1, 2;

CREATE OR REPLACE VIEW public.canonical_sources WITH (security_invoker = on) AS
SELECT
  date_trunc('day', first_seen_at)::date AS day,
  coalesce(utm_source, '(direct)') AS source,
  coalesce(utm_medium, '(none)')   AS medium,
  count(*)                          AS sessions,
  count(*) FILTER (WHERE order_id IS NOT NULL) AS purchases
FROM public.canonical_sessions
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW public.canonical_attribution WITH (security_invoker = on) AS
SELECT
  session_id, visitor_id,
  coalesce(utm_source, '(direct)')  AS source,
  coalesce(utm_medium, '(none)')    AS medium,
  utm_campaign, country, device, last_stage,
  order_id, stripe_session_id, first_seen_at, last_seen_at
FROM public.canonical_sessions;

CREATE OR REPLACE VIEW public.canonical_heatmap WITH (security_invoker = on) AS
SELECT
  date_trunc('day', occurred_at)::date AS day,
  coalesce(page_path, '(unknown)')     AS page_path,
  canonical_name                       AS stage,
  count(*)                             AS event_count,
  count(DISTINCT session_id)           AS unique_sessions
FROM public.canonical_events
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW public.canonical_kpis_hourly WITH (security_invoker = on) AS
SELECT
  date_trunc('hour', occurred_at) AS bucket,
  count(DISTINCT session_id)                                                  AS sessions,
  count(*) FILTER (WHERE canonical_name = 'CANONICAL_PRODUCT_VIEW')           AS product_views,
  count(*) FILTER (WHERE canonical_name = 'CANONICAL_ADD_TO_CART')            AS add_to_carts,
  count(*) FILTER (WHERE canonical_name = 'CANONICAL_CHECKOUT')               AS checkouts,
  count(*) FILTER (WHERE canonical_name = 'CANONICAL_PURCHASE')               AS purchases,
  coalesce(sum(value_cents) FILTER (WHERE canonical_name = 'CANONICAL_PURCHASE'),0) AS revenue_cents
FROM public.canonical_events
GROUP BY 1;

CREATE TABLE IF NOT EXISTS public.canonical_consistency_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key    text NOT NULL,
  severity     text NOT NULL DEFAULT 'warning',
  metric       text NOT NULL,
  expected     numeric,
  actual       numeric,
  diff_pct     numeric,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active    boolean NOT NULL DEFAULT true,
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  CONSTRAINT canonical_consistency_alerts_key_uniq UNIQUE (alert_key)
);

GRANT SELECT ON public.canonical_consistency_alerts TO authenticated;
GRANT ALL    ON public.canonical_consistency_alerts TO service_role;

ALTER TABLE public.canonical_consistency_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read canonical consistency alerts" ON public.canonical_consistency_alerts;
CREATE POLICY "Admins read canonical consistency alerts"
  ON public.canonical_consistency_alerts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS canonical_consistency_alerts_active_idx
  ON public.canonical_consistency_alerts(is_active, last_detected_at DESC);

-- Inline upsert helper
CREATE OR REPLACE FUNCTION public._canonical_upsert_alert(
  p_key text, p_metric text, p_expected numeric, p_actual numeric, p_window_start timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p_diff numeric := CASE WHEN coalesce(p_expected,0) = 0 THEN 0
                         ELSE round(abs(p_expected - p_actual) / NULLIF(p_expected,0) * 100, 4) END;
  threshold numeric := 0.5;
BEGIN
  IF p_diff > threshold THEN
    INSERT INTO public.canonical_consistency_alerts
      (alert_key, severity, metric, expected, actual, diff_pct, details)
    VALUES (p_key,
            CASE WHEN p_diff > 5 THEN 'high'
                 WHEN p_diff > 2 THEN 'medium'
                 ELSE 'warning' END,
            p_metric, p_expected, p_actual, p_diff,
            jsonb_build_object('window_start', p_window_start, 'window_end', now()))
    ON CONFLICT (alert_key) DO UPDATE SET
      is_active = true,
      severity = EXCLUDED.severity,
      expected = EXCLUDED.expected,
      actual = EXCLUDED.actual,
      diff_pct = EXCLUDED.diff_pct,
      last_detected_at = now(),
      resolved_at = NULL,
      details = EXCLUDED.details;
  ELSE
    UPDATE public.canonical_consistency_alerts
       SET is_active = false, resolved_at = now()
     WHERE alert_key = p_key AND is_active = true;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.canonical_validate_consistency()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  win timestamptz := now() - interval '24 hours';
  c_atc int; legacy_atc int;
  c_purch int; legacy_purch int;
  c_rev numeric; legacy_rev numeric;
BEGIN
  SELECT count(*) INTO c_atc      FROM public.canonical_events
    WHERE canonical_name = 'CANONICAL_ADD_TO_CART' AND occurred_at >= win;
  SELECT count(*) INTO legacy_atc FROM public.cci_events
    WHERE event_name IN ('add_to_cart_click','add_to_cart_success') AND created_at >= win;
  PERFORM public._canonical_upsert_alert('canonical_drift_add_to_cart','add_to_cart', legacy_atc, c_atc, win);

  SELECT count(*) INTO c_purch      FROM public.canonical_events
    WHERE canonical_name = 'CANONICAL_PURCHASE' AND order_id IS NOT NULL AND occurred_at >= win;
  SELECT count(*) INTO legacy_purch FROM public.orders
    WHERE status = 'paid' AND created_at >= win;
  PERFORM public._canonical_upsert_alert('canonical_drift_purchases','purchases', legacy_purch, c_purch, win);

  SELECT coalesce(sum(value_cents),0)/100.0 INTO c_rev FROM public.canonical_events
    WHERE canonical_name = 'CANONICAL_PURCHASE' AND order_id IS NOT NULL AND occurred_at >= win;
  SELECT coalesce(sum(total_amount),0) INTO legacy_rev FROM public.orders
    WHERE status = 'paid' AND created_at >= win;
  PERFORM public._canonical_upsert_alert('canonical_drift_revenue','revenue_eur', legacy_rev, c_rev, win);

  RETURN jsonb_build_object(
    'checked_at', now(),
    'window_hours', 24,
    'comparisons', jsonb_build_array(
      jsonb_build_object('metric','add_to_cart','canonical',c_atc,'legacy',legacy_atc),
      jsonb_build_object('metric','purchases','canonical',c_purch,'legacy',legacy_purch),
      jsonb_build_object('metric','revenue_eur','canonical',c_rev,'legacy',legacy_rev)
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.canonical_validate_consistency() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.canonical_validate_consistency() TO service_role;
REVOKE ALL ON FUNCTION public._canonical_upsert_alert(text,text,numeric,numeric,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._canonical_upsert_alert(text,text,numeric,numeric,timestamptz) TO service_role;
