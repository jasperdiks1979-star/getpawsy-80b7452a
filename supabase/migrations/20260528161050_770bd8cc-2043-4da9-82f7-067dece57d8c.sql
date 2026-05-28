
-- ============================================================
-- Iteration E: Autonomous Revenue Optimization Layer
-- ============================================================

-- 1) Unified AI priority queue
CREATE TABLE public.ai_priority_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_kind TEXT NOT NULL,           -- insight | winner | loser | traffic | merchandising | creative | seo | anomaly
  source_ref TEXT,                     -- product slug, url, insight id, etc.
  category TEXT NOT NULL,              -- winner | loser | traffic | merchandising | creative | seo | anomaly
  title TEXT NOT NULL,
  summary TEXT,
  recommended_action TEXT,
  expected_revenue_impact NUMERIC DEFAULT 0,  -- dollars / 30d
  confidence NUMERIC DEFAULT 0,                -- 0..1
  difficulty SMALLINT DEFAULT 3,               -- 1..5
  traffic_size INTEGER DEFAULT 0,
  priority_score NUMERIC NOT NULL DEFAULT 0,   -- computed weighted score
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | approved | dismissed | snoozed | done
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  snooze_until TIMESTAMPTZ,
  dedupe_key TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_aipq_priority ON public.ai_priority_queue(priority_score DESC);
CREATE INDEX idx_aipq_status ON public.ai_priority_queue(status, priority_score DESC);
CREATE INDEX idx_aipq_category ON public.ai_priority_queue(category);
CREATE UNIQUE INDEX idx_aipq_dedupe ON public.ai_priority_queue(dedupe_key) WHERE dedupe_key IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_priority_queue TO authenticated;
GRANT ALL ON public.ai_priority_queue TO service_role;

ALTER TABLE public.ai_priority_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage priority queue"
  ON public.ai_priority_queue FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) Merchandising recommendations
CREATE TABLE public.ai_merchandising_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rec_type TEXT NOT NULL,              -- homepage_hero | bestseller_rank | collection_order | related | cross_sell | bundle | tiktok_lp | pinterest_expand
  target_ref TEXT,                     -- slug, collection id, url
  current_state JSONB DEFAULT '{}'::jsonb,
  suggested_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  expected_impact NUMERIC DEFAULT 0,
  confidence NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | approved | applied | dismissed
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_aimr_type_status ON public.ai_merchandising_recommendations(rec_type, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_merchandising_recommendations TO authenticated;
GRANT ALL ON public.ai_merchandising_recommendations TO service_role;

ALTER TABLE public.ai_merchandising_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage merchandising recs"
  ON public.ai_merchandising_recommendations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) Executive snapshots
CREATE TABLE public.ai_executive_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  window_days INTEGER NOT NULL DEFAULT 7,
  revenue_health JSONB NOT NULL DEFAULT '{}'::jsonb,
  traffic_quality JSONB NOT NULL DEFAULT '{}'::jsonb,
  winners JSONB NOT NULL DEFAULT '[]'::jsonb,
  losers JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  anomalies JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_summary TEXT,
  generated_by TEXT DEFAULT 'manual',  -- manual | cron | trigger
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_aies_date ON public.ai_executive_snapshots(snapshot_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_executive_snapshots TO authenticated;
GRANT ALL ON public.ai_executive_snapshots TO service_role;

ALTER TABLE public.ai_executive_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage executive snapshots"
  ON public.ai_executive_snapshots FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- updated_at triggers
CREATE TRIGGER trg_aipq_updated_at BEFORE UPDATE ON public.ai_priority_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_aimr_updated_at BEFORE UPDATE ON public.ai_merchandising_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
