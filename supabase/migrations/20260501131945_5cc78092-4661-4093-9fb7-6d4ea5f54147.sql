-- UTM session log for validating incoming traffic (esp. TikTok)
CREATE TABLE IF NOT EXISTS public.utm_session_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  visitor_id TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  utm_id TEXT,
  gclid TEXT,
  fbclid TEXT,
  ttclid TEXT,
  referrer TEXT,
  landing_page TEXT,
  source_channel TEXT,
  validation_status TEXT NOT NULL DEFAULT 'unknown',
  missing_fields TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_utm_session_log_created_at ON public.utm_session_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_utm_session_log_channel ON public.utm_session_log(source_channel);
CREATE INDEX IF NOT EXISTS idx_utm_session_log_status ON public.utm_session_log(validation_status);

ALTER TABLE public.utm_session_log ENABLE ROW LEVEL SECURITY;

-- Anyone can insert their own session log (anonymous visitors)
DROP POLICY IF EXISTS "Anyone can insert utm session logs" ON public.utm_session_log;
CREATE POLICY "Anyone can insert utm session logs"
ON public.utm_session_log
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only admins can read
DROP POLICY IF EXISTS "Admins can read utm session logs" ON public.utm_session_log;
CREATE POLICY "Admins can read utm session logs"
ON public.utm_session_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- No one can update/delete from client (only via service role)

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_utm_session_log_updated_at ON public.utm_session_log;
CREATE TRIGGER update_utm_session_log_updated_at
BEFORE UPDATE ON public.utm_session_log
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Server-side validation + upsert helper
CREATE OR REPLACE FUNCTION public.log_utm_session(
  p_session_id TEXT,
  p_visitor_id TEXT,
  p_utm_source TEXT,
  p_utm_medium TEXT,
  p_utm_campaign TEXT,
  p_utm_term TEXT,
  p_utm_content TEXT,
  p_utm_id TEXT,
  p_gclid TEXT,
  p_fbclid TEXT,
  p_ttclid TEXT,
  p_referrer TEXT,
  p_landing_page TEXT,
  p_is_internal BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel TEXT;
  v_status TEXT;
  v_missing TEXT[] := '{}';
  v_id UUID;
  v_ref_lower TEXT := lower(coalesce(p_referrer, ''));
  v_src_lower TEXT := lower(coalesce(p_utm_source, ''));
BEGIN
  IF p_session_id IS NULL OR length(p_session_id) = 0 THEN
    RAISE EXCEPTION 'session_id required';
  END IF;

  -- Detect channel
  IF v_src_lower LIKE '%tiktok%' OR v_ref_lower LIKE '%tiktok%' OR p_ttclid IS NOT NULL THEN
    v_channel := 'tiktok';
  ELSIF v_src_lower LIKE '%google%' OR v_ref_lower LIKE '%google.%' OR p_gclid IS NOT NULL THEN
    v_channel := 'google';
  ELSIF v_src_lower LIKE '%facebook%' OR v_src_lower LIKE '%instagram%' OR p_fbclid IS NOT NULL THEN
    v_channel := 'meta';
  ELSIF v_src_lower LIKE '%pinterest%' OR v_ref_lower LIKE '%pinterest%' THEN
    v_channel := 'pinterest';
  ELSIF v_ref_lower = '' AND p_utm_source IS NULL THEN
    v_channel := 'direct';
  ELSE
    v_channel := coalesce(nullif(p_utm_source, ''), 'other');
  END IF;

  -- Compute missing fields per channel
  IF v_channel = 'tiktok' THEN
    IF p_utm_source IS NULL OR p_utm_source = '' THEN v_missing := array_append(v_missing, 'utm_source'); END IF;
    IF p_utm_medium IS NULL OR p_utm_medium = '' THEN v_missing := array_append(v_missing, 'utm_medium'); END IF;
    IF p_utm_campaign IS NULL OR p_utm_campaign = '' THEN v_missing := array_append(v_missing, 'utm_campaign'); END IF;
    IF p_utm_content IS NULL OR p_utm_content = '' THEN v_missing := array_append(v_missing, 'utm_content'); END IF;
  ELSIF v_channel IN ('google', 'meta', 'pinterest') THEN
    IF p_utm_source IS NULL OR p_utm_source = '' THEN v_missing := array_append(v_missing, 'utm_source'); END IF;
    IF p_utm_medium IS NULL OR p_utm_medium = '' THEN v_missing := array_append(v_missing, 'utm_medium'); END IF;
    IF p_utm_campaign IS NULL OR p_utm_campaign = '' THEN v_missing := array_append(v_missing, 'utm_campaign'); END IF;
  END IF;

  -- Status
  IF v_channel = 'direct' THEN
    v_status := 'direct';
  ELSIF array_length(v_missing, 1) IS NULL THEN
    v_status := 'valid';
  ELSIF p_utm_source IS NOT NULL AND p_utm_source <> '' THEN
    v_status := 'partial';
  ELSE
    v_status := 'missing';
  END IF;

  INSERT INTO public.utm_session_log (
    session_id, visitor_id,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_id,
    gclid, fbclid, ttclid,
    referrer, landing_page,
    source_channel, validation_status, missing_fields, is_internal
  ) VALUES (
    p_session_id, p_visitor_id,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_term, p_utm_content, p_utm_id,
    p_gclid, p_fbclid, p_ttclid,
    p_referrer, p_landing_page,
    v_channel, v_status, v_missing, coalesce(p_is_internal, false)
  )
  ON CONFLICT (session_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_utm_session(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN
) TO anon, authenticated;