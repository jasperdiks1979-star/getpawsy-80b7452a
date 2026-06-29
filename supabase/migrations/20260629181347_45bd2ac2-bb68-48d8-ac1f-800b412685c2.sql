
CREATE OR REPLACE FUNCTION public.canonical_session_upsert_recent(since timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.canonical_sessions
    (session_id, visitor_id, ga_client_id, first_seen_at, last_seen_at,
     landing_page, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
     country, city, device, browser, os, last_stage, order_id, stripe_session_id, updated_at)
  SELECT
    session_id,
    (array_agg(visitor_id) FILTER (WHERE visitor_id IS NOT NULL))[1],
    (array_agg(ga_client_id) FILTER (WHERE ga_client_id IS NOT NULL))[1],
    min(occurred_at), max(occurred_at),
    (array_agg(landing_page ORDER BY occurred_at) FILTER (WHERE landing_page IS NOT NULL))[1],
    (array_agg(referrer    ORDER BY occurred_at) FILTER (WHERE referrer    IS NOT NULL))[1],
    (array_agg(utm_source  ORDER BY occurred_at) FILTER (WHERE utm_source  IS NOT NULL))[1],
    (array_agg(utm_medium  ORDER BY occurred_at) FILTER (WHERE utm_medium  IS NOT NULL))[1],
    (array_agg(utm_campaign ORDER BY occurred_at) FILTER (WHERE utm_campaign IS NOT NULL))[1],
    (array_agg(utm_content ORDER BY occurred_at) FILTER (WHERE utm_content IS NOT NULL))[1],
    (array_agg(utm_term    ORDER BY occurred_at) FILTER (WHERE utm_term    IS NOT NULL))[1],
    (array_agg(country) FILTER (WHERE country IS NOT NULL))[1],
    (array_agg(city)    FILTER (WHERE city    IS NOT NULL))[1],
    (array_agg(device)  FILTER (WHERE device  IS NOT NULL))[1],
    (array_agg(browser) FILTER (WHERE browser IS NOT NULL))[1],
    (array_agg(os)      FILTER (WHERE os      IS NOT NULL))[1],
    (array_agg(canonical_name ORDER BY occurred_at DESC))[1],
    (array_agg(order_id)          FILTER (WHERE order_id          IS NOT NULL))[1],
    (array_agg(stripe_session_id) FILTER (WHERE stripe_session_id IS NOT NULL))[1],
    now()
  FROM public.canonical_events
  WHERE session_id IS NOT NULL
    AND ingested_at >= since
  GROUP BY session_id
  ON CONFLICT (session_id) DO UPDATE SET
    last_seen_at      = GREATEST(canonical_sessions.last_seen_at, EXCLUDED.last_seen_at),
    last_stage        = EXCLUDED.last_stage,
    order_id          = COALESCE(EXCLUDED.order_id, canonical_sessions.order_id),
    stripe_session_id = COALESCE(EXCLUDED.stripe_session_id, canonical_sessions.stripe_session_id),
    updated_at        = now();
END $$;

REVOKE ALL ON FUNCTION public.canonical_session_upsert_recent(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.canonical_session_upsert_recent(timestamptz) TO service_role;
