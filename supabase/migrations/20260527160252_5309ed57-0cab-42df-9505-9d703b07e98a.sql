
-- ============================================================
-- 1. lp_funnel_events: add integrity columns
-- ============================================================
ALTER TABLE public.lp_funnel_events
  ADD COLUMN IF NOT EXISTS event_source TEXT,
  ADD COLUMN IF NOT EXISTS user_action_id TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS source_component TEXT,
  ADD COLUMN IF NOT EXISTS is_bot BOOLEAN,
  ADD COLUMN IF NOT EXISTS bot_reason TEXT,
  ADD COLUMN IF NOT EXISTS traffic_quality_score INTEGER,
  ADD COLUMN IF NOT EXISTS geo_quality TEXT,
  ADD COLUMN IF NOT EXISTS deduped BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_status TEXT,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB;

-- Backfill legacy rows so they are excluded from the new dashboard
UPDATE public.lp_funnel_events
SET event_source = 'legacy_unverified'
WHERE event_source IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS lp_funnel_events_idempotency_key_uidx
  ON public.lp_funnel_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS lp_funnel_events_event_source_idx
  ON public.lp_funnel_events (event_source, created_at DESC);

CREATE INDEX IF NOT EXISTS lp_funnel_events_session_created_idx
  ON public.lp_funnel_events (session_id, created_at DESC);

-- ============================================================
-- 2. checkout_funnel_events: add integrity columns + new step values
-- ============================================================
ALTER TABLE public.checkout_funnel_events
  ADD COLUMN IF NOT EXISTS event_source TEXT,
  ADD COLUMN IF NOT EXISTS user_action_id TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS source_component TEXT,
  ADD COLUMN IF NOT EXISTS is_bot BOOLEAN,
  ADD COLUMN IF NOT EXISTS bot_reason TEXT,
  ADD COLUMN IF NOT EXISTS geo_quality TEXT,
  ADD COLUMN IF NOT EXISTS cart_id TEXT,
  ADD COLUMN IF NOT EXISTS item_count INTEGER,
  ADD COLUMN IF NOT EXISTS destination_url TEXT,
  ADD COLUMN IF NOT EXISTS error_reason TEXT;

UPDATE public.checkout_funnel_events
SET event_source = 'legacy_unverified'
WHERE event_source IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS checkout_funnel_events_idempotency_key_uidx
  ON public.checkout_funnel_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS checkout_funnel_events_step_created_idx
  ON public.checkout_funnel_events (step, created_at DESC);

-- ============================================================
-- 3. sessions table (one row per browser session)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sessions (
  session_id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  country TEXT,
  geo_quality TEXT,
  is_bot BOOLEAN,
  bot_reason TEXT,
  traffic_quality_score INTEGER,
  user_agent TEXT,
  landing_page TEXT,
  referrer TEXT,
  first_touch_source TEXT,
  first_touch_medium TEXT,
  first_touch_campaign TEXT,
  last_touch_source TEXT,
  last_touch_medium TEXT,
  last_touch_campaign TEXT,
  page_view_count INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0
);

GRANT SELECT, INSERT, UPDATE ON public.sessions TO anon;
GRANT SELECT, INSERT, UPDATE ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Anyone can insert/upsert their own session row (client-side enrichment).
CREATE POLICY "Anyone can insert sessions"
  ON public.sessions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update sessions"
  ON public.sessions
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can read sessions"
  ON public.sessions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages sessions"
  ON public.sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS sessions_started_at_idx
  ON public.sessions (started_at DESC);

CREATE INDEX IF NOT EXISTS sessions_geo_quality_idx
  ON public.sessions (geo_quality, started_at DESC);

CREATE INDEX IF NOT EXISTS sessions_is_bot_idx
  ON public.sessions (is_bot, started_at DESC);

-- ============================================================
-- 4. funnel_qa_runs (admin-only audit of the "Run Funnel QA" button)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.funnel_qa_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  run_by UUID,
  status TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT
);

GRANT SELECT, INSERT ON public.funnel_qa_runs TO authenticated;
GRANT ALL ON public.funnel_qa_runs TO service_role;

ALTER TABLE public.funnel_qa_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read funnel_qa_runs"
  ON public.funnel_qa_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert funnel_qa_runs"
  ON public.funnel_qa_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages funnel_qa_runs"
  ON public.funnel_qa_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
