ALTER TABLE public.visitor_activity
  ADD COLUMN IF NOT EXISTS visitor_id text;

CREATE INDEX IF NOT EXISTS idx_visitor_activity_visitor_id
  ON public.visitor_activity (visitor_id)
  WHERE visitor_id IS NOT NULL;

DROP POLICY IF EXISTS "Anyone can insert valid visitor activity" ON public.visitor_activity;

CREATE POLICY "Anyone can insert valid visitor activity"
ON public.visitor_activity
FOR INSERT
WITH CHECK (
  length(session_id) >= 16
  AND length(session_id) <= 100
  AND activity_type = ANY (ARRAY['browsing','cart','checkout','product_view','add_to_cart','view_cart','purchase'])
  AND (page_path IS NULL OR length(page_path) <= 500)
  AND (product_name IS NULL OR length(product_name) <= 500)
  AND (referrer_category IS NULL OR referrer_category = ANY (ARRAY['google','social','direct','email','paid','organic','other']))
  AND (visitor_id IS NULL OR (length(visitor_id) >= 16 AND length(visitor_id) <= 100))
);

CREATE OR REPLACE FUNCTION public.get_returning_visitor_stats(
  p_start timestamptz,
  p_end timestamptz,
  p_include_internal boolean DEFAULT false
)
RETURNS TABLE (
  total_visitors bigint,
  returning_visitors bigint,
  new_visitors bigint,
  total_sessions bigint,
  returning_visitor_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH window_visitors AS (
    SELECT DISTINCT visitor_id, session_id
    FROM public.visitor_activity
    WHERE created_at >= p_start
      AND created_at <  p_end
      AND visitor_id IS NOT NULL
      AND (p_include_internal OR is_internal IS NOT TRUE)
  ),
  unique_visitors AS (
    SELECT DISTINCT visitor_id FROM window_visitors
  ),
  returning_set AS (
    SELECT uv.visitor_id
    FROM unique_visitors uv
    WHERE EXISTS (
      SELECT 1 FROM public.visitor_activity va
      WHERE va.visitor_id = uv.visitor_id
        AND va.created_at < p_start
        AND (p_include_internal OR va.is_internal IS NOT TRUE)
    )
  )
  SELECT
    (SELECT count(*) FROM unique_visitors)::bigint AS total_visitors,
    (SELECT count(*) FROM returning_set)::bigint AS returning_visitors,
    ((SELECT count(*) FROM unique_visitors) - (SELECT count(*) FROM returning_set))::bigint AS new_visitors,
    (SELECT count(DISTINCT session_id) FROM window_visitors)::bigint AS total_sessions,
    CASE
      WHEN (SELECT count(*) FROM unique_visitors) = 0 THEN 0
      ELSE round(
        ((SELECT count(*) FROM returning_set)::numeric
         / (SELECT count(*) FROM unique_visitors)::numeric) * 100,
        2
      )
    END AS returning_visitor_pct;
$$;

GRANT EXECUTE ON FUNCTION public.get_returning_visitor_stats(timestamptz, timestamptz, boolean) TO anon, authenticated;