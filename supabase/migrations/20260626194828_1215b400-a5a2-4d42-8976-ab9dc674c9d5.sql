
-- =========================================================
-- Evolution Engine V1 — Phase 1 Foundation
-- Additive only. Reads from existing tables; writes only ee_*.
-- =========================================================

-- 1. ee_runs (nightly job log)
CREATE TABLE public.ee_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error TEXT,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  triggered_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ee_runs TO authenticated;
GRANT ALL ON public.ee_runs TO service_role;
ALTER TABLE public.ee_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ee_runs admin read" ON public.ee_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ee_runs service all" ON public.ee_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. ee_run_steps
CREATE TABLE public.ee_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.ee_runs(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  duration_ms INTEGER,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ee_run_steps_run_idx ON public.ee_run_steps(run_id);
GRANT SELECT ON public.ee_run_steps TO authenticated;
GRANT ALL ON public.ee_run_steps TO service_role;
ALTER TABLE public.ee_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ee_run_steps admin read" ON public.ee_run_steps FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ee_run_steps service all" ON public.ee_run_steps FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. ee_settings (feature flags; default ALL OFF)
CREATE TABLE public.ee_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ee_settings TO authenticated;
GRANT ALL ON public.ee_settings TO service_role;
ALTER TABLE public.ee_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ee_settings admin read" ON public.ee_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ee_settings admin write" ON public.ee_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ee_settings service all" ON public.ee_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.ee_settings(key, value, description) VALUES
  ('mode', '"observation_only"'::jsonb, 'Master mode: observation_only | recommend | auto (auto never enabled in Phase 1)'),
  ('nightly_rollup_enabled', 'false'::jsonb, 'Phase 1 nightly cron toggle — disabled by default'),
  ('predictive_scoring_enabled', 'false'::jsonb, 'Whether evolution-predictive-score runs on new drafts'),
  ('learning_ingest_enabled', 'false'::jsonb, 'Whether evolution-learning-ingest runs nightly'),
  ('phase', '1'::jsonb, 'Active Evolution Engine phase')
ON CONFLICT (key) DO NOTHING;

-- 4. ee_model_versions
CREATE TABLE public.ee_model_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  kind TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  trained_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, version)
);
GRANT SELECT ON public.ee_model_versions TO authenticated;
GRANT ALL ON public.ee_model_versions TO service_role;
ALTER TABLE public.ee_model_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ee_model_versions admin read" ON public.ee_model_versions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ee_model_versions service all" ON public.ee_model_versions FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.ee_model_versions(name, version, kind, is_active, params) VALUES
  ('predictive_baseline', 'v0.1.0', 'linear', true, '{"features":["headline_id","board_id","hour_bucket","emotion_id","image_dna_id"],"notes":"phase-1 baseline; uses category priors when vectors are sparse"}'::jsonb)
ON CONFLICT (name, version) DO NOTHING;

-- 5. ee_learning_events (immutable append-only)
CREATE TABLE public.ee_learning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  pin_id TEXT,
  product_id UUID,
  board_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ee_learning_events_pin_idx ON public.ee_learning_events(pin_id);
CREATE INDEX ee_learning_events_product_idx ON public.ee_learning_events(product_id);
CREATE INDEX ee_learning_events_time_idx ON public.ee_learning_events(occurred_at DESC);
GRANT SELECT ON public.ee_learning_events TO authenticated;
GRANT ALL ON public.ee_learning_events TO service_role;
ALTER TABLE public.ee_learning_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ee_learning_events admin read" ON public.ee_learning_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ee_learning_events service all" ON public.ee_learning_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. ee_learning_history (per-pin daily snapshot)
CREATE TABLE public.ee_learning_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id TEXT NOT NULL,
  product_id UUID,
  board_id TEXT,
  snapshot_date DATE NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  outbound_clicks INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC(8,5),
  engagement NUMERIC(8,5),
  pin_lifetime_days INTEGER,
  ga4_sessions INTEGER NOT NULL DEFAULT 0,
  ga4_avg_engagement_seconds NUMERIC(10,2),
  ga4_bounce_rate NUMERIC(6,4),
  add_to_cart INTEGER NOT NULL DEFAULT 0,
  checkout INTEGER NOT NULL DEFAULT 0,
  purchases INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  conversion_rate NUMERIC(8,5),
  roas NUMERIC(10,4),
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pin_id, snapshot_date)
);
CREATE INDEX ee_learning_history_date_idx ON public.ee_learning_history(snapshot_date DESC);
CREATE INDEX ee_learning_history_product_idx ON public.ee_learning_history(product_id);
CREATE INDEX ee_learning_history_board_idx ON public.ee_learning_history(board_id);
GRANT SELECT ON public.ee_learning_history TO authenticated;
GRANT ALL ON public.ee_learning_history TO service_role;
ALTER TABLE public.ee_learning_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ee_learning_history admin read" ON public.ee_learning_history FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ee_learning_history service all" ON public.ee_learning_history FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7. ee_learning_vectors (per-pin feature vector)
CREATE TABLE public.ee_learning_vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id TEXT NOT NULL UNIQUE,
  product_id UUID,
  headline_id UUID,
  image_dna_id UUID,
  emotion_id TEXT,
  board_id TEXT,
  hour_bucket SMALLINT,
  weekday SMALLINT,
  ctr_score NUMERIC(8,5),
  save_score NUMERIC(8,5),
  purchase_score NUMERIC(8,5),
  trust_score NUMERIC(8,5),
  novelty_score NUMERIC(8,5),
  spam_score NUMERIC(8,5),
  freshness_score NUMERIC(8,5),
  composite_score NUMERIC(8,5),
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ee_learning_vectors_product_idx ON public.ee_learning_vectors(product_id);
CREATE INDEX ee_learning_vectors_composite_idx ON public.ee_learning_vectors(composite_score DESC NULLS LAST);
GRANT SELECT ON public.ee_learning_vectors TO authenticated;
GRANT ALL ON public.ee_learning_vectors TO service_role;
ALTER TABLE public.ee_learning_vectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ee_learning_vectors admin read" ON public.ee_learning_vectors FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ee_learning_vectors service all" ON public.ee_learning_vectors FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8. ee_learning_products
CREATE TABLE public.ee_learning_products (
  product_id UUID PRIMARY KEY,
  pins_count INTEGER NOT NULL DEFAULT 0,
  impressions_total BIGINT NOT NULL DEFAULT 0,
  saves_total BIGINT NOT NULL DEFAULT 0,
  outbound_total BIGINT NOT NULL DEFAULT 0,
  purchases_total INTEGER NOT NULL DEFAULT 0,
  revenue_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  avg_ctr NUMERIC(8,5),
  avg_save_rate NUMERIC(8,5),
  avg_conv_rate NUMERIC(8,5),
  popularity_score NUMERIC(8,5),
  pinterest_fit_score NUMERIC(8,5),
  composite_score NUMERIC(8,5),
  last_pin_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ee_learning_products_composite_idx ON public.ee_learning_products(composite_score DESC NULLS LAST);
GRANT SELECT ON public.ee_learning_products TO authenticated;
GRANT ALL ON public.ee_learning_products TO service_role;
ALTER TABLE public.ee_learning_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ee_learning_products admin read" ON public.ee_learning_products FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ee_learning_products service all" ON public.ee_learning_products FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9. ee_learning_boards
CREATE TABLE public.ee_learning_boards (
  board_id TEXT PRIMARY KEY,
  pins_count INTEGER NOT NULL DEFAULT 0,
  impressions_total BIGINT NOT NULL DEFAULT 0,
  saves_total BIGINT NOT NULL DEFAULT 0,
  outbound_total BIGINT NOT NULL DEFAULT 0,
  purchases_total INTEGER NOT NULL DEFAULT 0,
  revenue_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  avg_ctr NUMERIC(8,5),
  composite_score NUMERIC(8,5),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ee_learning_boards TO authenticated;
GRANT ALL ON public.ee_learning_boards TO service_role;
ALTER TABLE public.ee_learning_boards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ee_learning_boards admin read" ON public.ee_learning_boards FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ee_learning_boards service all" ON public.ee_learning_boards FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 10. ee_predictions
CREATE TABLE public.ee_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID,
  pin_id TEXT,
  product_id UUID,
  model_version_id UUID REFERENCES public.ee_model_versions(id) ON DELETE SET NULL,
  predicted_impressions INTEGER,
  predicted_ctr NUMERIC(8,5),
  predicted_outbound INTEGER,
  predicted_saves INTEGER,
  predicted_purchases INTEGER,
  predicted_revenue NUMERIC(12,2),
  predicted_roas NUMERIC(10,4),
  spam_risk NUMERIC(6,4),
  trust_score NUMERIC(6,4),
  novelty_score NUMERIC(6,4),
  confidence NUMERIC(6,4),
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  actual_impressions INTEGER,
  actual_ctr NUMERIC(8,5),
  actual_outbound INTEGER,
  actual_saves INTEGER,
  actual_purchases INTEGER,
  actual_revenue NUMERIC(12,2),
  actual_recorded_at TIMESTAMPTZ,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ee_predictions_draft_idx ON public.ee_predictions(draft_id);
CREATE INDEX ee_predictions_pin_idx ON public.ee_predictions(pin_id);
CREATE INDEX ee_predictions_product_idx ON public.ee_predictions(product_id);
GRANT SELECT ON public.ee_predictions TO authenticated;
GRANT ALL ON public.ee_predictions TO service_role;
ALTER TABLE public.ee_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ee_predictions admin read" ON public.ee_predictions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ee_predictions service all" ON public.ee_predictions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Validation trigger (not CHECK) for time-window
CREATE OR REPLACE FUNCTION public.ee_predictions_validate()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.window_start IS NOT NULL AND NEW.window_end IS NOT NULL
     AND NEW.window_end <= NEW.window_start THEN
    RAISE EXCEPTION 'ee_predictions.window_end must be after window_start';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER ee_predictions_validate_trg
BEFORE INSERT OR UPDATE ON public.ee_predictions
FOR EACH ROW EXECUTE FUNCTION public.ee_predictions_validate();

-- updated_at triggers (reuse generic if exists, else define local)
CREATE OR REPLACE FUNCTION public.ee_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

CREATE TRIGGER ee_runs_touch BEFORE UPDATE ON public.ee_runs FOR EACH ROW EXECUTE FUNCTION public.ee_touch_updated_at();
CREATE TRIGGER ee_settings_touch BEFORE UPDATE ON public.ee_settings FOR EACH ROW EXECUTE FUNCTION public.ee_touch_updated_at();
CREATE TRIGGER ee_learning_history_touch BEFORE UPDATE ON public.ee_learning_history FOR EACH ROW EXECUTE FUNCTION public.ee_touch_updated_at();
CREATE TRIGGER ee_learning_vectors_touch BEFORE UPDATE ON public.ee_learning_vectors FOR EACH ROW EXECUTE FUNCTION public.ee_touch_updated_at();
CREATE TRIGGER ee_learning_products_touch BEFORE UPDATE ON public.ee_learning_products FOR EACH ROW EXECUTE FUNCTION public.ee_touch_updated_at();
CREATE TRIGGER ee_learning_boards_touch BEFORE UPDATE ON public.ee_learning_boards FOR EACH ROW EXECUTE FUNCTION public.ee_touch_updated_at();
