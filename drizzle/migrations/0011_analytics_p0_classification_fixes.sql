-- P0 analytics correctness: self-referral, Meta agents, session evidence, guide-assist view.
-- Additive only; no backfill, no data deletion.

ALTER TABLE public.canonical_sessions
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS crawler_identity text;

CREATE INDEX IF NOT EXISTS crawler_visits_session_id_idx
  ON public.crawler_visits (session_id) WHERE session_id IS NOT NULL;

-- 1) classify_channel_v2: own-host referrer is not external evidence; Meta agents are verifiers.
DO $do$
DECLARE d text; d0 text;
BEGIN
  d := pg_get_functiondef('public.classify_channel_v2(text,text,text,text,text,text,jsonb,boolean,boolean)'::regprocedure);
  IF position('getpawsy_self_referrer' in d) = 0 THEN
    d0 := d;
    d := replace(d,
$s$BEGIN
  -- Normalize the "direct/(none)" GA4 sentinel to empty.$s$,
$r$BEGIN
  -- getpawsy_self_referrer: own-host referrers are internal navigation, never external human evidence.
  IF ref ~ '^(https?://)?(www\.)?getpawsy\.pet([/:?#]|$)' THEN ref := ''; END IF;
  -- Normalize the "direct/(none)" GA4 sentinel to empty.$r$);
    IF d = d0 THEN RAISE EXCEPTION 'classify_channel_v2 self-referrer patch anchor not found'; END IF;
    d0 := d;
    d := replace(d, $s$ua ~ 'facebookexternalhit|twitterbot$s$,
                    $r$ua ~ 'facebookexternalhit|meta-externalagent|meta-externalfetcher|facebookcatalog|facebot|twitterbot$r$);
    IF d = d0 THEN RAISE EXCEPTION 'classify_channel_v2 meta-agent patch anchor not found'; END IF;
    EXECUTE d;
  END IF;
END
$do$;

-- 2) Session evidence from crawler_visits (UA + safe crawler identity), recent scope only.
CREATE OR REPLACE FUNCTION public.canonical_session_apply_evidence(since timestamp with time zone)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE n integer;
BEGIN
  WITH scope AS (
    SELECT cs.session_id FROM public.canonical_sessions cs
    WHERE cs.first_seen_at >= since - interval '2 hours'
       OR cs.updated_at    >= since - interval '2 hours'
  ),
  ev AS (
    SELECT cv.session_id,
      (array_agg(cv.user_agent ORDER BY cv.created_at) FILTER (WHERE cv.user_agent IS NOT NULL AND cv.user_agent <> ''))[1] AS ua,
      (array_agg(cv.crawler_identity ORDER BY cv.crawler_verified DESC NULLS LAST, cv.created_at) FILTER (
         WHERE cv.crawler_identity IS NOT NULL
           AND (cv.crawler_verified IS TRUE
                OR cv.crawler_identity IN ('Meta-Crawler','Generic-Automation')
                OR cv.crawler_family IN ('search','seo_tool'))
      ))[1] AS ci
    FROM public.crawler_visits cv
    JOIN scope s ON s.session_id = cv.session_id
    GROUP BY cv.session_id
  ),
  upd AS (
    UPDATE public.canonical_sessions cs
    SET user_agent       = COALESCE(cs.user_agent, left(ev.ua, 500)),
        crawler_identity = COALESCE(cs.crawler_identity, ev.ci),
        updated_at       = now()
    FROM ev
    WHERE cs.session_id = ev.session_id
      AND ((cs.user_agent IS NULL AND ev.ua IS NOT NULL)
        OR (cs.crawler_identity IS NULL AND ev.ci IS NOT NULL))
    RETURNING 1
  )
  SELECT count(*) INTO n FROM upd;
  RETURN n;
END
$f$;
REVOKE ALL ON FUNCTION public.canonical_session_apply_evidence(timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonical_session_apply_evidence(timestamp with time zone) TO service_role;

-- Run evidence pass at the end of the existing activity pass.
DO $do$
DECLARE d text; d0 text;
BEGIN
  d := pg_get_functiondef('public.canonical_session_apply_activity(timestamp with time zone)'::regprocedure);
  IF position('canonical_session_apply_evidence' in d) = 0 THEN
    d0 := d;
    d := replace(d,
$s$  SELECT count(*) INTO n FROM upd;
  RETURN n;$s$,
$r$  SELECT count(*) INTO n FROM upd;
  PERFORM public.canonical_session_apply_evidence(since);
  RETURN n;$r$);
    IF d = d0 THEN RAISE EXCEPTION 'canonical_session_apply_activity patch anchor not found'; END IF;
    EXECUTE d;
  END IF;
END
$do$;

-- Trigger: pass UA + interaction evidence; crawler_visits identity outranks referrer evidence.
CREATE OR REPLACE FUNCTION public.canonical_sessions_set_classified_channel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  eff_ref  text := COALESCE(NULLIF(NEW.first_referrer, ''), NEW.referrer);
  eff_src  text := COALESCE(NULLIF(NEW.first_utm_source, ''), NEW.utm_source);
  eff_med  text := COALESCE(NULLIF(NEW.first_utm_medium, ''), NEW.utm_medium);
  ids jsonb := '{}'::jsonb;
  v2 jsonb;
BEGIN
  IF NEW.first_gclid              IS NOT NULL THEN ids := ids || jsonb_build_object('gclid', NEW.first_gclid); END IF;
  IF NEW.first_fbclid             IS NOT NULL THEN ids := ids || jsonb_build_object('fbclid', NEW.first_fbclid); END IF;
  IF NEW.first_ttclid             IS NOT NULL THEN ids := ids || jsonb_build_object('ttclid', NEW.first_ttclid); END IF;
  IF NEW.first_msclkid            IS NOT NULL THEN ids := ids || jsonb_build_object('msclkid', NEW.first_msclkid); END IF;
  IF NEW.first_pinterest_click_id IS NOT NULL THEN ids := ids || jsonb_build_object('pinterest_click_id', NEW.first_pinterest_click_id); END IF;
  IF NEW.first_reddit_click_id    IS NOT NULL THEN ids := ids || jsonb_build_object('reddit_click_id', NEW.first_reddit_click_id); END IF;

  -- Legacy classifier (unchanged behavior for existing views/callers)
  NEW.classified_channel := public.classify_traffic_source(eff_ref, eff_src, eff_med, ids);

  v2 := public.classify_channel_v2(
    eff_ref, eff_src, eff_med,
    NEW.user_agent,
    NEW.first_landing_path,
    NULL,
    ids,
    NULL,                                        -- JS evidence alone is not human evidence
    CASE WHEN COALESCE(NEW.interaction_count, 0) > 0 THEN true ELSE NULL END
  );

  IF NEW.crawler_identity IS NOT NULL
     AND COALESCE(v2->>'traffic_class','') NOT IN ('INTERNAL_PREVIEW','INTERNAL_AUTOMATION','BOT_CONFIRMED','VERIFIER') THEN
    v2 := jsonb_build_object(
      'traffic_class', CASE WHEN NEW.crawler_identity = 'Meta-Crawler' THEN 'VERIFIER' ELSE 'BOT_CONFIRMED' END,
      'channel',       CASE WHEN NEW.crawler_identity = 'Meta-Crawler' THEN 'social_verifier' ELSE 'crawler' END,
      'is_internal', true,
      'exclude_from_commercial', true,
      'reason', 'crawler_visits_identity',
      'bot_name', NEW.crawler_identity
    );
  END IF;

  NEW.traffic_class           := v2->>'traffic_class';
  NEW.is_internal             := (v2->>'is_internal')::boolean;
  NEW.exclude_from_commercial := (v2->>'exclude_from_commercial')::boolean;
  NEW.classification_reason   := v2->>'reason';
  NEW.bot_name                := v2->>'bot_name';
  NEW.classifier_version      := 'v2.1';

  RETURN NEW;
END;
$function$;

-- 5) Read-only guide → PDP → ATC assist view (no new events, no double counting).
CREATE OR REPLACE VIEW public.guide_assist_attribution_v1
WITH (security_invoker = true) AS
SELECT
  g.id                               AS click_id,
  g.session_id,
  g.created_at                       AS clicked_at,
  g.page_path                        AS guide_path,
  g.raw_payload->>'guide_slug'       AS guide_slug,
  g.raw_payload->>'product_slug'     AS product_slug,
  g.placement,
  pv.first_product_view_at,
  atc.first_add_to_cart_at
FROM public.lp_funnel_events g
LEFT JOIN LATERAL (
  SELECT min(ce.occurred_at) AS first_product_view_at
  FROM public.canonical_events ce
  WHERE ce.session_id = g.session_id
    AND ce.canonical_name = 'CANONICAL_PRODUCT_VIEW'
    AND ce.occurred_at >= g.created_at - interval '5 seconds'
    AND ce.occurred_at <  g.created_at + interval '30 minutes'
    AND (g.raw_payload->>'product_slug' IS NULL
         OR position('/products/' || (g.raw_payload->>'product_slug') in COALESCE(ce.page_path, '')) > 0)
) pv ON true
LEFT JOIN LATERAL (
  SELECT min(ce.occurred_at) AS first_add_to_cart_at
  FROM public.canonical_events ce
  WHERE ce.session_id = g.session_id
    AND ce.canonical_name = 'CANONICAL_ADD_TO_CART'
    AND ce.occurred_at >= g.created_at
    AND ce.occurred_at <  g.created_at + interval '60 minutes'
) atc ON true
WHERE g.event_name = 'guide_product_click';

GRANT SELECT ON public.guide_assist_attribution_v1 TO authenticated;
GRANT ALL ON public.guide_assist_attribution_v1 TO service_role;