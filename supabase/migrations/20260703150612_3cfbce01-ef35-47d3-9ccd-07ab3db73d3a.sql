
-- Wave A: session forensics views (no new writers, no new tables)

CREATE OR REPLACE VIEW public.session_forensics
WITH (security_invoker = true) AS
WITH ux AS (
  SELECT
    session_id,
    count(*) FILTER (WHERE signal_type = 'rage_click')::int   AS rage_clicks,
    count(*) FILTER (WHERE signal_type = 'dead_click')::int   AS dead_clicks,
    count(*) FILTER (WHERE signal_type = 'form_abandon')::int AS form_abandons,
    max( (payload->>'threshold')::int ) FILTER (WHERE signal_type = 'scroll_depth') AS max_scroll_depth
  FROM public.cro_ux_signals
  GROUP BY session_id
),
base AS (
  SELECT
    w.session_id,
    w.visitor_id,
    w.landing_page                                  AS entry_page,
    w.utm_source, w.utm_medium, w.utm_campaign,
    w.referrer,
    cs.country, cs.city,
    coalesce(w.device, cs.device)                   AS device,
    cs.browser, cs.os,
    coalesce(w.session_start_at, w.landing_at, w.created_at) AS first_seen_at,
    coalesce(w.last_step_at, w.updated_at)          AS last_seen_at,
    w.add_to_cart_at, w.view_cart_at,
    w.begin_checkout_at, w.payment_at, w.purchase_at,
    w.furthest_step, w.last_step, w.traffic_type,
    w.product_id, w.product_name, w.value, w.currency,
    cs.order_id, cs.stripe_session_id
  FROM public.analytics_funnel_waterfall w
  LEFT JOIN public.canonical_sessions cs ON cs.session_id = w.session_id
)
SELECT
  b.*,
  coalesce(u.rage_clicks, 0)  AS rage_clicks,
  coalesce(u.dead_clicks, 0)  AS dead_clicks,
  coalesce(u.form_abandons,0) AS form_abandons,
  coalesce(u.max_scroll_depth, 0) AS max_scroll_depth,
  extract(epoch FROM (b.last_seen_at - b.first_seen_at))::int AS time_on_site_seconds,
  (b.add_to_cart_at IS NOT NULL)     AS cart_opened,
  (b.begin_checkout_at IS NOT NULL)  AS checkout_started,
  (b.purchase_at IS NOT NULL)        AS purchased,
  CASE
    WHEN b.purchase_at IS NOT NULL THEN 'purchased'
    WHEN b.payment_at IS NOT NULL THEN 'payment_fail'
    WHEN b.begin_checkout_at IS NOT NULL THEN 'checkout_abandon'
    WHEN b.add_to_cart_at IS NOT NULL THEN 'cart_abandon'
    WHEN extract(epoch FROM (b.last_seen_at - b.first_seen_at)) < 15 THEN 'short_visit'
    ELSE 'bounce'
  END AS exit_reason
FROM base b
LEFT JOIN ux u ON u.session_id = b.session_id;

GRANT SELECT ON public.session_forensics TO authenticated, service_role;

-- Ordered per-session journey (unpivoted waterfall)
CREATE OR REPLACE VIEW public.session_journey_steps
WITH (security_invoker = true) AS
SELECT session_id, 'click'::text            AS step, click_at            AS ts FROM public.analytics_funnel_waterfall WHERE click_at            IS NOT NULL
UNION ALL SELECT session_id, 'landing',           landing_at           FROM public.analytics_funnel_waterfall WHERE landing_at           IS NOT NULL
UNION ALL SELECT session_id, 'engagement_start',  engagement_start_at  FROM public.analytics_funnel_waterfall WHERE engagement_start_at  IS NOT NULL
UNION ALL SELECT session_id, 'page_view',         page_view_at         FROM public.analytics_funnel_waterfall WHERE page_view_at         IS NOT NULL
UNION ALL SELECT session_id, 'scroll',            scroll_at            FROM public.analytics_funnel_waterfall WHERE scroll_at            IS NOT NULL
UNION ALL SELECT session_id, 'view_item',         view_item_at         FROM public.analytics_funnel_waterfall WHERE view_item_at         IS NOT NULL
UNION ALL SELECT session_id, 'add_to_cart',       add_to_cart_at       FROM public.analytics_funnel_waterfall WHERE add_to_cart_at       IS NOT NULL
UNION ALL SELECT session_id, 'view_cart',         view_cart_at         FROM public.analytics_funnel_waterfall WHERE view_cart_at         IS NOT NULL
UNION ALL SELECT session_id, 'begin_checkout',    begin_checkout_at    FROM public.analytics_funnel_waterfall WHERE begin_checkout_at    IS NOT NULL
UNION ALL SELECT session_id, 'payment',           payment_at           FROM public.analytics_funnel_waterfall WHERE payment_at           IS NOT NULL
UNION ALL SELECT session_id, 'purchase',          purchase_at          FROM public.analytics_funnel_waterfall WHERE purchase_at          IS NOT NULL;

GRANT SELECT ON public.session_journey_steps TO authenticated, service_role;

-- Human-only view: filter through canonical real_human_sessions
CREATE OR REPLACE VIEW public.session_forensics_human
WITH (security_invoker = true) AS
SELECT sf.*
FROM public.session_forensics sf
WHERE sf.session_id IN (SELECT session_id FROM public.real_human_sessions);

GRANT SELECT ON public.session_forensics_human TO authenticated, service_role;
