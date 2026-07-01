
-- Add trace_id linkage across AI request → gen lock → PRE outcome
ALTER TABLE public.ai_prompt_cache      ADD COLUMN IF NOT EXISTS trace_id uuid;
ALTER TABLE public.ai_generation_locks  ADD COLUMN IF NOT EXISTS trace_id uuid;
ALTER TABLE public.pre_evaluations      ADD COLUMN IF NOT EXISTS trace_id uuid;

CREATE INDEX IF NOT EXISTS idx_ai_prompt_cache_trace_id     ON public.ai_prompt_cache(trace_id)     WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_generation_locks_trace_id ON public.ai_generation_locks(trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pre_evaluations_trace_id     ON public.pre_evaluations(trace_id)     WHERE trace_id IS NOT NULL;

-- Central trace ledger — every AI request stage keyed by trace_id
CREATE TABLE IF NOT EXISTS public.ai_trace_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id uuid NOT NULL,
  parent_trace_id uuid NULL,
  product_slug text NULL,
  product_id uuid NULL,
  function_name text NOT NULL,
  lane text NULL,
  stage text NOT NULL,           -- e.g. cache_lookup, cache_hit, cache_store, lock_acquire, lock_release, ai_request, ai_response, pre_evaluate, pre_pass, pre_fail, gateway_402
  model text NULL,
  status text NULL,              -- ok | fail | skipped | blocked
  cache_hit boolean NULL,
  credits_estimated numeric NULL,
  latency_ms integer NULL,
  pin_queue_id uuid NULL,
  pre_evaluation_id uuid NULL,
  cache_key text NULL,
  lock_run_id text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_trace_events TO authenticated;
GRANT ALL    ON public.ai_trace_events TO service_role;
ALTER TABLE public.ai_trace_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_trace_events admins read" ON public.ai_trace_events;
CREATE POLICY "ai_trace_events admins read" ON public.ai_trace_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "ai_trace_events service write" ON public.ai_trace_events;
CREATE POLICY "ai_trace_events service write" ON public.ai_trace_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ai_trace_events_trace_id   ON public.ai_trace_events(trace_id);
CREATE INDEX IF NOT EXISTS idx_ai_trace_events_product    ON public.ai_trace_events(product_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_trace_events_function   ON public.ai_trace_events(function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_trace_events_stage      ON public.ai_trace_events(stage, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_trace_events_created    ON public.ai_trace_events(created_at DESC);

-- Rolling waste-hotspot view: last 24h grouped by product & stage
CREATE OR REPLACE VIEW public.ai_trace_waste_hotspots_24h AS
SELECT
  product_slug,
  function_name,
  lane,
  stage,
  status,
  count(*)                                              AS events,
  count(*) FILTER (WHERE cache_hit IS TRUE)             AS cache_hits,
  count(*) FILTER (WHERE cache_hit IS FALSE)            AS cache_misses,
  count(*) FILTER (WHERE status = 'fail')               AS failures,
  count(*) FILTER (WHERE status = 'blocked')            AS blocked,
  round(avg(latency_ms)::numeric, 0)                    AS avg_latency_ms,
  round(sum(coalesce(credits_estimated,0))::numeric, 2) AS credits_est_total,
  max(created_at)                                       AS last_seen_at
FROM public.ai_trace_events
WHERE created_at > now() - interval '24 hours'
GROUP BY product_slug, function_name, lane, stage, status;

GRANT SELECT ON public.ai_trace_waste_hotspots_24h TO authenticated;
