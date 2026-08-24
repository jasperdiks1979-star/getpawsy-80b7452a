CREATE OR REPLACE VIEW public.canonical_sessions_commercial_v2 AS
SELECT
  cs.session_id,
  cs.visitor_id,
  cs.first_seen_at,
  cs.last_seen_at,
  cs.country,
  cs.device,
  cs.classified_channel,
  cs.traffic_class            AS traffic_class_v2,
  cs.classification_reason,
  COALESCE(cs.is_internal, false)             AS is_internal,
  COALESCE(cs.is_bot, false)                  AS is_bot,
  COALESCE(cs.technical_path, false)          AS technical_path,
  COALESCE(cs.exclude_from_commercial, false) AS exclude_from_commercial,
  b.acquisition_bucket,
  (b.acquisition_bucket IN ('ORGANIC_SEARCH','PINTEREST_ORGANIC','OTHER_ORGANIC_SOCIAL','REFERRAL','DIRECT','PAID')) AS commercial_included
FROM public.canonical_sessions cs
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN COALESCE(cs.is_internal, false) OR cs.traffic_class IN ('INTERNAL','INTERNAL_PREVIEW') THEN 'INTERNAL'
    WHEN COALESCE(cs.is_bot, false) OR cs.traffic_class IN ('BOT','CRAWLER') THEN 'BOT'
    WHEN COALESCE(cs.technical_path, false) THEN 'TECHNICAL'
    WHEN COALESCE(cs.exclude_from_commercial, false)
      OR cs.traffic_class IS NULL
      OR cs.traffic_class IN ('UNKNOWN','')
      THEN 'UNKNOWN'
    WHEN cs.classified_channel LIKE '%\_ads'
      OR cs.classified_channel LIKE '%\_paid'
      OR cs.classified_channel IN ('affiliate_paid','shopping_paid','unknown_paid') THEN 'PAID'
    WHEN cs.classified_channel LIKE 'pinterest%' THEN 'PINTEREST_ORGANIC'
    WHEN cs.classified_channel IN (
      'google_organic','bing_organic','duckduckgo_organic','yahoo_organic',
      'ecosia_organic','brave_organic','baidu_organic','yandex_organic'
    ) THEN 'ORGANIC_SEARCH'
    WHEN cs.classified_channel IN (
      'tiktok_organic','facebook_organic','instagram_organic','reddit_organic',
      'youtube_organic','linkedin_organic','email_organic'
    ) THEN 'OTHER_ORGANIC_SOCIAL'
    WHEN cs.classified_channel = 'referral' THEN 'REFERRAL'
    WHEN cs.classified_channel = 'direct' THEN 'DIRECT'
    ELSE 'UNKNOWN'
  END AS acquisition_bucket
) b;

COMMENT ON VIEW public.canonical_sessions_commercial_v2 IS
'Authoritative v2 commercial-inclusion contract. Business KPI surfaces MUST use commercial_included + acquisition_bucket here; never legacy classified_channel-derived organic.';

CREATE OR REPLACE VIEW public.canonical_acquisition_funnel_24h AS
WITH sess AS (
  SELECT * FROM public.canonical_sessions_commercial_v2
  WHERE last_seen_at > now() - interval '24 hours'
), ev AS (
  SELECT session_id, canonical_name, value_cents
  FROM public.canonical_events
  WHERE occurred_at > now() - interval '24 hours'
)
SELECT
  s.acquisition_bucket,
  s.commercial_included,
  count(DISTINCT s.session_id) AS sessions,
  count(DISTINCT s.visitor_id) AS visitors,
  count(*) FILTER (WHERE e.canonical_name = 'CANONICAL_PAGE_VIEW') AS page_views,
  count(*) FILTER (WHERE e.canonical_name = 'CANONICAL_PRODUCT_VIEW') AS product_views,
  count(DISTINCT s.session_id) FILTER (WHERE e.canonical_name = 'CANONICAL_ADD_TO_CART') AS add_to_cart,
  count(DISTINCT s.session_id) FILTER (WHERE e.canonical_name = 'CANONICAL_CHECKOUT') AS checkout_started,
  count(DISTINCT s.session_id) FILTER (WHERE e.canonical_name = 'CANONICAL_PURCHASE') AS purchases,
  COALESCE(sum(e.value_cents) FILTER (WHERE e.canonical_name = 'CANONICAL_PURCHASE'), 0) AS revenue_cents
FROM sess s
LEFT JOIN ev e ON e.session_id = s.session_id AND s.commercial_included
GROUP BY s.acquisition_bucket, s.commercial_included
ORDER BY count(DISTINCT s.session_id) DESC;

COMMENT ON VIEW public.canonical_acquisition_funnel_24h IS
'24h acquisition buckets on the v2 commercial predicate. Funnel events only join for commercial_included sessions.';

GRANT SELECT ON public.canonical_sessions_commercial_v2 TO authenticated;
GRANT SELECT ON public.canonical_acquisition_funnel_24h TO authenticated;
GRANT ALL ON public.canonical_sessions_commercial_v2 TO service_role;
GRANT ALL ON public.canonical_acquisition_funnel_24h TO service_role;