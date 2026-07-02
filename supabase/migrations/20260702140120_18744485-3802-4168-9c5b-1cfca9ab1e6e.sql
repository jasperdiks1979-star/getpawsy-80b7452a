
CREATE OR REPLACE FUNCTION public.canonical_session_apply_attribution(since timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  upd AS (
    UPDATE public.canonical_sessions cs
    SET
      first_utm_source       = COALESCE(cs.first_utm_source,   fe.utm_source),
      first_utm_medium       = COALESCE(cs.first_utm_medium,   fe.utm_medium),
      first_utm_campaign     = COALESCE(cs.first_utm_campaign, fe.utm_campaign),
      first_utm_content      = COALESCE(cs.first_utm_content,  fe.utm_content),
      first_utm_term         = COALESCE(cs.first_utm_term,     fe.utm_term),
      first_gclid            = COALESCE(cs.first_gclid,        fe.meta->>'gclid'),
      first_fbclid           = COALESCE(cs.first_fbclid,       fe.meta->>'fbclid'),
      first_ttclid           = COALESCE(cs.first_ttclid,       fe.meta->>'ttclid'),
      first_msclkid          = COALESCE(cs.first_msclkid,      fe.meta->>'msclkid'),
      first_pinterest_click_id = COALESCE(cs.first_pinterest_click_id, fe.meta->>'pinterest_click_id'),
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
                                   'pinterest_click_id', fe.meta->>'pinterest_click_id',
                                   'reddit_click_id',    fe.meta->>'reddit_click_id'
                                 ))
                               ),
      attribution_snapshot_at = COALESCE(cs.attribution_snapshot_at, now()),
      attribution_locked      = true,
      updated_at              = now()
    FROM first_ev fe
    WHERE cs.session_id = fe.session_id
      AND cs.attribution_locked = false
    RETURNING 1
  )
  SELECT count(*) INTO n FROM upd;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.canonical_session_apply_attribution(timestamptz)
  TO service_role, authenticated;

-- Wrap the existing recent refresh so a single call does both.
CREATE OR REPLACE FUNCTION public.canonical_session_refresh_with_attribution(since timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sessions_touched integer;
  attributed integer;
BEGIN
  PERFORM public.canonical_session_upsert_recent(since);
  GET DIAGNOSTICS sessions_touched = ROW_COUNT;
  SELECT public.canonical_session_apply_attribution(since) INTO attributed;
  RETURN jsonb_build_object('sessions_touched', sessions_touched, 'attributed', attributed);
END;
$$;

GRANT EXECUTE ON FUNCTION public.canonical_session_refresh_with_attribution(timestamptz)
  TO service_role, authenticated;

-- Backfill classification for existing sessions with a first_seen in the last 30d
SELECT public.canonical_session_apply_attribution(now() - interval '30 days');
