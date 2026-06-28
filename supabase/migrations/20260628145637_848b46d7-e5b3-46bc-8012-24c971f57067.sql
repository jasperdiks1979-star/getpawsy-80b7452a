
CREATE OR REPLACE VIEW public.v_creative_revenue_lineage AS
SELECT
  c.id                            AS creative_id,
  c.product_id,
  c.headline,
  c.hook,
  c.image_url,
  c.creative_dna,
  c.scores,
  c.status                        AS creative_status,
  c.pinterest_pin_id,
  q.id                            AS queue_id,
  q.board_id,
  q.board_name,
  q.category_key,
  q.hook_group,
  q.pin_variant,
  q.posted_at,
  q.destination_link,
  q.verification_state,
  perf.impressions,
  perf.clicks                     AS pin_clicks,
  perf.saves,
  CASE WHEN perf.impressions > 0
    THEN (perf.clicks::numeric / perf.impressions) ELSE NULL END AS ctr,
  CASE WHEN perf.impressions > 0
    THEN (perf.saves::numeric / perf.impressions) ELSE NULL END  AS save_rate,
  sess.sessions_count,
  attr.orders                     AS attributed_orders,
  attr.purchases                  AS attributed_purchases,
  attr.add_to_carts               AS attributed_add_to_carts,
  attr.revenue_cents              AS attributed_revenue_cents,
  attr.roas                       AS attributed_roas
FROM pcie2_creatives c
LEFT JOIN pinterest_pin_queue q
  ON q.pcie2_creative_id = c.id
LEFT JOIN LATERAL (
  SELECT
    sum(p.impressions)::bigint AS impressions,
    sum(p.clicks)::bigint      AS clicks,
    sum(p.saves)::bigint       AS saves
  FROM pinterest_pin_performance p
  WHERE p.pin_id = c.pinterest_pin_id
) perf ON true
LEFT JOIN LATERAL (
  SELECT count(*)::bigint AS sessions_count
  FROM pinterest_attribution_sessions s
  WHERE s.pin_id = c.pinterest_pin_id
) sess ON true
LEFT JOIN LATERAL (
  SELECT a.orders, a.purchases, a.add_to_carts, a.revenue_cents, a.roas
  FROM pinterest_revenue_attribution_v3 a
  WHERE a.pin_id = c.pinterest_pin_id AND a.window_days = 30
  LIMIT 1
) attr ON true
WHERE c.pinterest_pin_id IS NOT NULL;

REVOKE ALL ON public.v_creative_revenue_lineage FROM PUBLIC;
REVOKE ALL ON public.v_creative_revenue_lineage FROM anon;
GRANT SELECT ON public.v_creative_revenue_lineage TO authenticated, service_role;
