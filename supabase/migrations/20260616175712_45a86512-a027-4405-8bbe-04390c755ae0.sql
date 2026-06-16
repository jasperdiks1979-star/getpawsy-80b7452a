-- 1) Add pin_id column to utm_session_log
ALTER TABLE public.utm_session_log
  ADD COLUMN IF NOT EXISTS pin_id text;

CREATE INDEX IF NOT EXISTS utm_session_log_pin_id_idx
  ON public.utm_session_log (pin_id)
  WHERE pin_id IS NOT NULL;

-- 2) Update RPC to accept p_pin_id (keep old signature working by adding optional param at end)
CREATE OR REPLACE FUNCTION public.log_utm_session(
  p_session_id   text,
  p_visitor_id   text,
  p_utm_source   text,
  p_utm_medium   text,
  p_utm_campaign text,
  p_utm_term     text,
  p_utm_content  text,
  p_utm_id       text,
  p_gclid        text,
  p_fbclid       text,
  p_ttclid       text,
  p_referrer     text,
  p_landing_page text,
  p_is_internal  boolean DEFAULT false,
  p_pin_id       text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_channel TEXT;
  v_status  TEXT;
  v_missing TEXT[] := '{}';
  v_id      UUID;
  v_ref_lower TEXT := lower(coalesce(p_referrer, ''));
  v_src_lower TEXT := lower(coalesce(p_utm_source, ''));
  v_pin_id  TEXT  := p_pin_id;
BEGIN
  IF p_session_id IS NULL OR length(p_session_id) = 0 THEN
    RAISE EXCEPTION 'session_id required';
  END IF;

  -- Extract pin_id from landing_page if not explicitly passed
  IF v_pin_id IS NULL AND p_landing_page IS NOT NULL THEN
    v_pin_id := substring(p_landing_page from 'pin_id=([0-9a-fA-F\-]{8,})');
  END IF;

  IF v_src_lower LIKE '%tiktok%' OR v_ref_lower LIKE '%tiktok%' OR p_ttclid IS NOT NULL THEN
    v_channel := 'tiktok';
  ELSIF v_src_lower LIKE '%google%' OR v_ref_lower LIKE '%google.%' OR p_gclid IS NOT NULL THEN
    v_channel := 'google';
  ELSIF v_src_lower LIKE '%facebook%' OR v_src_lower LIKE '%instagram%' OR p_fbclid IS NOT NULL THEN
    v_channel := 'meta';
  ELSIF v_src_lower LIKE '%pinterest%' OR v_ref_lower LIKE '%pinterest%' THEN
    v_channel := 'pinterest';
  ELSE
    v_channel := coalesce(nullif(v_src_lower, ''), 'direct');
  END IF;

  IF p_utm_source IS NULL THEN v_missing := array_append(v_missing, 'utm_source'); END IF;
  IF p_utm_medium IS NULL THEN v_missing := array_append(v_missing, 'utm_medium'); END IF;
  IF p_utm_campaign IS NULL THEN v_missing := array_append(v_missing, 'utm_campaign'); END IF;

  v_status := CASE WHEN array_length(v_missing,1) IS NULL THEN 'ok' ELSE 'incomplete' END;

  INSERT INTO public.utm_session_log (
    session_id, visitor_id, utm_source, utm_medium, utm_campaign,
    utm_term, utm_content, utm_id, gclid, fbclid, ttclid,
    referrer, landing_page, source_channel, validation_status,
    missing_fields, is_internal, pin_id
  ) VALUES (
    p_session_id, p_visitor_id, p_utm_source, p_utm_medium, p_utm_campaign,
    p_utm_term, p_utm_content, p_utm_id, p_gclid, p_fbclid, p_ttclid,
    p_referrer, p_landing_page, v_channel, v_status,
    v_missing, coalesce(p_is_internal, false), v_pin_id
  )
  ON CONFLICT (session_id) DO UPDATE
    SET pin_id = COALESCE(public.utm_session_log.pin_id, EXCLUDED.pin_id),
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- 3) Backfill historical rows
UPDATE public.utm_session_log
SET pin_id = substring(landing_page from 'pin_id=([0-9a-fA-F\-]{8,})')
WHERE pin_id IS NULL
  AND landing_page LIKE '%pin_id=%';