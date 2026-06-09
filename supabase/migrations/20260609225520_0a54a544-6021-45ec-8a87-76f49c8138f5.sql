
-- 1) Daily score per pin
CREATE TABLE IF NOT EXISTS public.pinterest_revenue_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  pin_id text NOT NULL,
  product_id uuid,
  product_slug text,
  category_key text,
  board_name text,
  impressions integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  outbound_clicks integer NOT NULL DEFAULT 0,
  product_views integer NOT NULL DEFAULT 0,
  add_to_carts integer NOT NULL DEFAULT 0,
  checkouts integer NOT NULL DEFAULT 0,
  purchases integer NOT NULL DEFAULT 0,
  revenue_cents integer NOT NULL DEFAULT 0,
  ctr numeric(8,5) NOT NULL DEFAULT 0,
  save_rate numeric(8,5) NOT NULL DEFAULT 0,
  atc_rate numeric(8,5) NOT NULL DEFAULT 0,
  purchase_rate numeric(8,5) NOT NULL DEFAULT 0,
  pinterest_score numeric(8,4) NOT NULL DEFAULT 0,
  classification text NOT NULL DEFAULT 'unknown'
    CHECK (classification IN ('winner','average','loser','insufficient_data','unknown')),
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, pin_id)
);
CREATE INDEX IF NOT EXISTS prs_day_idx ON public.pinterest_revenue_scores(day DESC);
CREATE INDEX IF NOT EXISTS prs_product_idx ON public.pinterest_revenue_scores(product_id);
CREATE INDEX IF NOT EXISTS prs_class_idx ON public.pinterest_revenue_scores(classification);

GRANT SELECT ON public.pinterest_revenue_scores TO authenticated;
GRANT ALL ON public.pinterest_revenue_scores TO service_role;
ALTER TABLE public.pinterest_revenue_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read revenue scores"
  ON public.pinterest_revenue_scores FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "service writes revenue scores"
  ON public.pinterest_revenue_scores FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2) Winner action log
CREATE TABLE IF NOT EXISTS public.pinterest_winner_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL
    CHECK (action_type IN ('pause_loser','scale_winner','regenerate_creative',
                           'validate_draft','release_draft','dedupe_block','manual_override')),
  pin_id text,
  product_id uuid,
  product_slug text,
  reason text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'pinterest-revenue-engine',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pwal_created_idx ON public.pinterest_winner_actions_log(created_at DESC);
CREATE INDEX IF NOT EXISTS pwal_action_idx ON public.pinterest_winner_actions_log(action_type);
CREATE INDEX IF NOT EXISTS pwal_product_idx ON public.pinterest_winner_actions_log(product_id);

GRANT SELECT ON public.pinterest_winner_actions_log TO authenticated;
GRANT ALL ON public.pinterest_winner_actions_log TO service_role;
ALTER TABLE public.pinterest_winner_actions_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read action log"
  ON public.pinterest_winner_actions_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "service writes action log"
  ON public.pinterest_winner_actions_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3) Funnel rollup view (read-only). Joins analytics + attribution + downstream events + orders.
CREATE OR REPLACE VIEW public.pinterest_revenue_funnel_daily
WITH (security_invoker = false) AS
WITH pin_meta AS (
  SELECT DISTINCT ON (pinterest_pin_id)
    pinterest_pin_id AS pin_id,
    product_id::uuid AS product_id,
    product_slug,
    category_key,
    board_name
  FROM public.pinterest_pin_queue
  WHERE pinterest_pin_id IS NOT NULL
  ORDER BY pinterest_pin_id, posted_at DESC NULLS LAST
),
analytics AS (
  SELECT pin_id, day, impressions, outbound_clicks, saves
  FROM public.pinterest_analytics_daily
),
sessions AS (
  SELECT pin_id, date_trunc('day', first_seen)::date AS day,
         COUNT(*) FILTER (WHERE pin_id IS NOT NULL) AS sessions_count
  FROM public.pinterest_attribution_sessions
  WHERE pin_id IS NOT NULL
  GROUP BY 1,2
),
downstream AS (
  SELECT s.pin_id,
         date_trunc('day', e.occurred_at)::date AS day,
         COUNT(*) FILTER (WHERE e.event_type IN ('view','click')) AS product_views,
         COUNT(*) FILTER (WHERE e.event_type = 'add_to_cart') AS add_to_carts,
         COUNT(*) FILTER (WHERE e.event_type = 'checkout') AS checkouts,
         COUNT(*) FILTER (WHERE e.event_type = 'purchase') AS purchases,
         COALESCE(SUM(e.revenue_cents) FILTER (WHERE e.event_type = 'purchase'), 0) AS revenue_cents
  FROM public.gi_attribution_events e
  JOIN public.pinterest_attribution_sessions s ON s.session_key = e.session_id
  WHERE s.pin_id IS NOT NULL
  GROUP BY 1,2
)
SELECT
  a.day,
  a.pin_id,
  m.product_id,
  m.product_slug,
  m.category_key,
  m.board_name,
  COALESCE(a.impressions,0) AS impressions,
  COALESCE(a.saves,0) AS saves,
  COALESCE(a.outbound_clicks,0) AS outbound_clicks,
  COALESCE(d.product_views,0) AS product_views,
  COALESCE(d.add_to_carts,0) AS add_to_carts,
  COALESCE(d.checkouts,0) AS checkouts,
  COALESCE(d.purchases,0) AS purchases,
  COALESCE(d.revenue_cents,0) AS revenue_cents
FROM analytics a
LEFT JOIN pin_meta m ON m.pin_id = a.pin_id
LEFT JOIN downstream d ON d.pin_id = a.pin_id AND d.day = a.day;

GRANT SELECT ON public.pinterest_revenue_funnel_daily TO authenticated, service_role;
