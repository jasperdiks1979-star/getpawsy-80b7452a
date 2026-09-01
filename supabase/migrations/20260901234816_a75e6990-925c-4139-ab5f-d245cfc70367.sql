-- 1. New measurement columns (raw evidence preserved separately)
ALTER TABLE public.canonical_sessions
  ADD COLUMN IF NOT EXISTS effective_last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS reported_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS effective_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS duration_evidence_source text;

-- 2. First-touch lock must protect EXISTING values, never NULLs
CREATE OR REPLACE FUNCTION public.canonical_sessions_lock_first_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.attribution_locked = true THEN
    NEW.first_utm_source         := COALESCE(OLD.first_utm_source,   NEW.first_utm_source);
    NEW.first_utm_medium         := COALESCE(OLD.first_utm_medium,   NEW.first_utm_medium);
    NEW.first_utm_campaign       := COALESCE(OLD.first_utm_campaign, NEW.first_utm_campaign);
    NEW.first_utm_content        := COALESCE(OLD.first_utm_content,  NEW.first_utm_content);
    NEW.first_utm_term           := COALESCE(OLD.first_utm_term,     NEW.first_utm_term);
    NEW.first_gclid              := COALESCE(OLD.first_gclid,        NEW.first_gclid);
    NEW.first_fbclid             := COALESCE(OLD.first_fbclid,       NEW.first_fbclid);
    NEW.first_ttclid             := COALESCE(OLD.first_ttclid,       NEW.first_ttclid);
    NEW.first_msclkid            := COALESCE(OLD.first_msclkid,      NEW.first_msclkid);
    NEW.first_pinterest_click_id := COALESCE(OLD.first_pinterest_click_id, NEW.first_pinterest_click_id);
    NEW.first_reddit_click_id    := COALESCE(OLD.first_reddit_click_id,    NEW.first_reddit_click_id);
    NEW.first_email_id           := COALESCE(OLD.first_email_id,     NEW.first_email_id);
    NEW.first_affiliate_id       := COALESCE(OLD.first_affiliate_id, NEW.first_affiliate_id);
    NEW.first_referrer           := COALESCE(OLD.first_referrer,     NEW.first_referrer);
    NEW.first_landing_url        := COALESCE(OLD.first_landing_url,  NEW.first_landing_url);
    NEW.first_landing_path       := COALESCE(OLD.first_landing_path, NEW.first_landing_path);
    NEW.attribution_snapshot_at  := COALESCE(OLD.attribution_snapshot_at, NEW.attribution_snapshot_at);
    NEW.attribution_locked       := true;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. Session upsert: recover NULL attribution/context fields (never overwrite a value with NULL)
CREATE OR REPLACE FUNCTION public.canonical_session_upsert_recent(since timestamp with time zone)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    landing_page      = COALESCE(canonical_sessions.landing_page, EXCLUDED.landing_page),
    referrer          = COALESCE(canonical_sessions.referrer,     EXCLUDED.referrer),
    utm_source        = COALESCE(canonical_sessions.utm_source,   EXCLUDED.utm_source),
    utm_medium        = COALESCE(canonical_sessions.utm_medium,   EXCLUDED.utm_medium),
    utm_campaign      = COALESCE(canonical_sessions.utm_campaign, EXCLUDED.utm_campaign),
    utm_content       = COALESCE(canonical_sessions.utm_content,  EXCLUDED.utm_content),
    utm_term          = COALESCE(canonical_sessions.utm_term,     EXCLUDED.utm_term),
    country           = COALESCE(canonical_sessions.country, EXCLUDED.country),
    city              = COALESCE(canonical_sessions.city,    EXCLUDED.city),
    device            = COALESCE(canonical_sessions.device,  EXCLUDED.device),
    browser           = COALESCE(canonical_sessions.browser, EXCLUDED.browser),
    os                = COALESCE(canonical_sessions.os,      EXCLUDED.os),
    order_id          = COALESCE(EXCLUDED.order_id, canonical_sessions.order_id),
    stripe_session_id = COALESCE(EXCLUDED.stripe_session_id, canonical_sessions.stripe_session_id),
    updated_at        = now();
END $function$;

-- 4. Attribution pass: also repair sessions whose lock captured NULLs
CREATE OR REPLACE FUNCTION public.canonical_session_apply_attribution(since timestamp with time zone)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  n integer;
BEGIN
  WITH first_ev AS (
    SELECT DISTINCT ON (ce.session_id)
      ce.session_id,
      ce.utm_source, ce.utm_medium, ce.utm_campaign, ce.utm_content, ce.utm_term,
      ce.referrer, ce.landing_page, ce.page_path,
      ce.meta,
      ce.occurred_at
    FROM public.canonical_events ce
    WHERE ce.session_id IS NOT NULL
      AND ce.ingested_at >= since - interval '5 minutes'
    ORDER BY ce.session_id, ce.occurred_at ASC
  ),
  enriched AS (
    -- meta first, then the EXACT value present in the stored landing URL query string
    SELECT
      fe.*,
      COALESCE(
        NULLIF(fe.meta->>'pinterest_click_id',''),
        NULLIF(fe.meta->>'epik',''),
        NULLIF((regexp_match(COALESCE(fe.landing_page,''), '[?&]epik=([^&#]+)'))[1], '')
      ) AS pin_click_id,
      COALESCE(
        fe.utm_content,
        NULLIF(fe.meta->>'utm_content',''),
        NULLIF((regexp_match(COALESCE(fe.landing_page,''), '[?&]utm_content=([^&#]+)'))[1], '')
      ) AS eff_utm_content
    FROM first_ev fe
  ),
  upd AS (
    UPDATE public.canonical_sessions cs
    SET
      first_utm_source       = COALESCE(cs.first_utm_source,   fe.utm_source),
      first_utm_medium       = COALESCE(cs.first_utm_medium,   fe.utm_medium),
      first_utm_campaign     = COALESCE(cs.first_utm_campaign, fe.utm_campaign),
      first_utm_content      = COALESCE(cs.first_utm_content,  fe.eff_utm_content),
      utm_content            = COALESCE(cs.utm_content,        fe.eff_utm_content),
      first_utm_term         = COALESCE(cs.first_utm_term,     fe.utm_term),
      first_gclid            = COALESCE(cs.first_gclid,        fe.meta->>'gclid'),
      first_fbclid           = COALESCE(cs.first_fbclid,       fe.meta->>'fbclid'),
      first_ttclid           = COALESCE(cs.first_ttclid,       fe.meta->>'ttclid'),
      first_msclkid          = COALESCE(cs.first_msclkid,      fe.meta->>'msclkid'),
      first_pinterest_click_id = COALESCE(cs.first_pinterest_click_id, fe.pin_click_id),
      first_reddit_click_id  = COALESCE(cs.first_reddit_click_id,  fe.meta->>'reddit_click_id'),
      first_email_id         = COALESCE(cs.first_email_id,     fe.meta->>'email_id'),
      first_affiliate_id     = COALESCE(cs.first_affiliate_id, fe.meta->>'affiliate_id'),
      first_referrer         = COALESCE(cs.first_referrer,     fe.referrer),
      first_landing_url      = COALESCE(cs.first_landing_url,  fe.landing_page),
      first_landing_path     = COALESCE(cs.first_landing_path, fe.page_path),
      classified_channel     = public.classify_traffic_source(
                                 COALESCE(cs.first_referrer, fe.referrer),
                                 COALESCE(cs.first_utm_source, fe.utm_source),
                                 COALESCE(cs.first_utm_medium, fe.utm_medium),
                                 jsonb_strip_nulls(jsonb_build_object(
                                   'gclid',   fe.meta->>'gclid',
                                   'fbclid',  fe.meta->>'fbclid',
                                   'ttclid',  fe.meta->>'ttclid',
                                   'msclkid', fe.meta->>'msclkid',
                                   'pinterest_click_id', COALESCE(cs.first_pinterest_click_id, fe.pin_click_id),
                                   'reddit_click_id',    fe.meta->>'reddit_click_id'
                                 ))
                               ),
      attribution_snapshot_at = COALESCE(cs.attribution_snapshot_at, now()),
      attribution_locked      = true,
      updated_at              = now()
    FROM enriched fe
    WHERE cs.session_id = fe.session_id
      AND (
        cs.attribution_locked = false
        OR (cs.first_utm_content IS NULL AND fe.eff_utm_content IS NOT NULL)
        OR (cs.utm_content IS NULL AND fe.eff_utm_content IS NOT NULL)
        OR (cs.first_pinterest_click_id IS NULL AND fe.pin_click_id IS NOT NULL)
      )
    RETURNING 1
  )
  SELECT count(*) INTO n FROM upd;
  RETURN n;
END;
$function$;

-- 5. Activity pass: effective duration + engagement + deliberate interactions
--    Semantics:
--      effective_last_seen_at = MAX(canonical last_seen_at, latest canonical event,
--                                   latest deterministic same-session visitor_activity timestamp)
--      engagement_ms          = effective duration, which is fully bounded by OBSERVED
--                               visibility-aware first-party activity (the heartbeat pauses
--                               while the tab is hidden). No page-close inference.
--      interaction_count      = deliberate user actions only (add-to-cart, cart open,
--                               checkout click/load). page_view / product_view / Klarna
--                               renders / automatic tag events are excluded.
CREATE OR REPLACE FUNCTION public.canonical_session_apply_activity(since timestamp with time zone)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  n integer;
BEGIN
  WITH scope AS (
    SELECT cs.session_id, cs.first_seen_at, cs.last_seen_at
    FROM public.canonical_sessions cs
    WHERE cs.first_seen_at >= since - interval '2 hours'
       OR cs.updated_at    >= since - interval '2 hours'
  ),
  ev AS (
    SELECT ce.session_id, max(ce.occurred_at) AS max_event_at
    FROM public.canonical_events ce
    JOIN scope s ON s.session_id::text = ce.session_id::text
    GROUP BY ce.session_id
  ),
  va AS (
    SELECT
      s.session_id,
      max(GREATEST(v.created_at, COALESCE(v.last_seen_at, v.created_at))) AS max_activity_at,
      max(COALESCE(v.last_seen_at, v.created_at)) FILTER (
        WHERE v.last_seen_at IS NOT NULL AND v.last_seen_at > v.created_at
      ) AS max_heartbeat_at,
      count(*) FILTER (WHERE v.activity_type IN ('cart','view_cart','checkout')) AS deliberate_activity
    FROM scope s
    JOIN public.visitor_activity v
      ON v.session_id::text = s.session_id::text
     AND v.created_at >= s.first_seen_at - interval '5 minutes'
    GROUP BY s.session_id
  ),
  inter AS (
    SELECT s.session_id, count(*) AS deliberate_events
    FROM scope s
    JOIN public.cci_events c
      ON c.session_id::text = s.session_id::text
     AND c.event_name IN ('add_to_cart_click','add_to_cart_success','cart_open','checkout_click','checkout_loaded','payment_redirect_started')
    GROUP BY s.session_id
  ),
  calc AS (
    SELECT
      s.session_id,
      s.first_seen_at,
      s.last_seen_at,
      GREATEST(
        s.last_seen_at,
        COALESCE(ev.max_event_at, s.last_seen_at),
        COALESCE(va.max_activity_at, s.last_seen_at)
      ) AS eff_last,
      va.max_heartbeat_at,
      COALESCE(va.deliberate_activity, 0) + COALESCE(inter.deliberate_events, 0) AS raw_interactions,
      COALESCE(va.max_activity_at, s.last_seen_at) AS va_last,
      COALESCE(ev.max_event_at, s.last_seen_at) AS ev_last
    FROM scope s
    LEFT JOIN ev ON ev.session_id::text = s.session_id::text
    LEFT JOIN va ON va.session_id::text = s.session_id::text
    LEFT JOIN inter ON inter.session_id::text = s.session_id::text
  ),
  upd AS (
    UPDATE public.canonical_sessions cs
    SET
      effective_last_seen_at     = c.eff_last,
      reported_duration_seconds  = GREATEST(0, EXTRACT(EPOCH FROM (c.last_seen_at - c.first_seen_at))::int),
      effective_duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (c.eff_last - c.first_seen_at))::int),
      duration_evidence_source   = CASE
        WHEN c.eff_last <= c.ev_last THEN 'canonical_event'
        WHEN c.max_heartbeat_at IS NOT NULL AND c.eff_last <= c.max_heartbeat_at THEN 'heartbeat'
        WHEN c.raw_interactions > 0 THEN 'interaction'
        ELSE 'page_activity'
      END,
      engagement_ms = GREATEST(
        COALESCE(cs.engagement_ms, 0),
        GREATEST(0, EXTRACT(EPOCH FROM (c.eff_last - c.first_seen_at))::int) * 1000
      ),
      interaction_count = GREATEST(COALESCE(cs.interaction_count, 0), c.raw_interactions),
      updated_at = now()
    FROM calc c
    WHERE cs.session_id = c.session_id
      AND (
        cs.effective_last_seen_at IS DISTINCT FROM c.eff_last
        OR cs.effective_duration_seconds IS NULL
        OR COALESCE(cs.interaction_count,0) < c.raw_interactions
      )
    RETURNING 1
  )
  SELECT count(*) INTO n FROM upd;
  RETURN n;
END;
$function$;

-- 6. Wire the activity pass into the standard refresh
CREATE OR REPLACE FUNCTION public.canonical_session_refresh_with_attribution(since timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  sessions_touched integer;
  attributed integer;
  activity integer;
BEGIN
  PERFORM public.canonical_session_upsert_recent(since);
  GET DIAGNOSTICS sessions_touched = ROW_COUNT;
  SELECT public.canonical_session_apply_attribution(since) INTO attributed;
  SELECT public.canonical_session_apply_activity(since) INTO activity;
  RETURN jsonb_build_object('sessions_touched', sessions_touched, 'attributed', attributed, 'activity_repaired', activity);
END;
$function$;