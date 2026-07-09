
-- =============================================================================
-- Pinterest Experiment Engine V1 (PXE) — additive, admin-only registry
-- No modifications to PCIE2, Guardian, Recovery, Resurrection, Distribution
-- Monitor, Analytics, Queues, or any existing dashboards.
-- =============================================================================

-- ---------- experiments ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pxe_experiments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,             -- e.g. 'title_length_v1'
  hypothesis      TEXT NOT NULL,
  dimension       TEXT NOT NULL,                    -- title | copy | scene | board | timing | price | subject | style
  metric          TEXT NOT NULL DEFAULT 'ctr',      -- ctr | saves_per_impression | sessions_per_pin | revenue_per_pin
  status          TEXT NOT NULL DEFAULT 'template', -- template | queued | running | stopped | completed | archived
  allocation_pct  NUMERIC NOT NULL DEFAULT 10,      -- % of a wave allocated to this experiment
  sample_target   INTEGER NOT NULL DEFAULT 200,     -- pins per variant
  confidence_target NUMERIC NOT NULL DEFAULT 0.95,
  start_at        TIMESTAMPTZ,
  end_at          TIMESTAMPTZ,
  notes           TEXT,
  result_summary  TEXT,
  winner_variant  UUID,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pxe_experiments TO authenticated;
GRANT ALL ON public.pxe_experiments TO service_role;
ALTER TABLE public.pxe_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pxe_experiments admin all"
  ON public.pxe_experiments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- variants ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pxe_variants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id   UUID NOT NULL REFERENCES public.pxe_experiments(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,                    -- 'A short titles', 'B long titles'
  is_control      BOOLEAN NOT NULL DEFAULT FALSE,
  definition      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pxe_variants TO authenticated;
GRANT ALL ON public.pxe_variants TO service_role;
ALTER TABLE public.pxe_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pxe_variants admin all"
  ON public.pxe_variants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_pxe_variants_experiment ON public.pxe_variants(experiment_id);

-- ---------- assignments (opt-in, empty until publishers integrate) ----------
CREATE TABLE IF NOT EXISTS public.pxe_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id   UUID NOT NULL REFERENCES public.pxe_experiments(id) ON DELETE CASCADE,
  variant_id      UUID NOT NULL REFERENCES public.pxe_variants(id) ON DELETE CASCADE,
  pin_id          TEXT,
  product_id      UUID,
  wave_code       TEXT,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pxe_assignments TO authenticated;
GRANT ALL ON public.pxe_assignments TO service_role;
ALTER TABLE public.pxe_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pxe_assignments admin all"
  ON public.pxe_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_pxe_assignments_exp     ON public.pxe_assignments(experiment_id);
CREATE INDEX IF NOT EXISTS idx_pxe_assignments_variant ON public.pxe_assignments(variant_id);
CREATE INDEX IF NOT EXISTS idx_pxe_assignments_pin     ON public.pxe_assignments(pin_id);

-- ---------- observations (per-variant metric snapshots) ----------------------
CREATE TABLE IF NOT EXISTS public.pxe_observations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id   UUID NOT NULL REFERENCES public.pxe_experiments(id) ON DELETE CASCADE,
  variant_id      UUID NOT NULL REFERENCES public.pxe_variants(id) ON DELETE CASCADE,
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  pins            INTEGER NOT NULL DEFAULT 0,
  impressions     BIGINT  NOT NULL DEFAULT 0,
  clicks          BIGINT  NOT NULL DEFAULT 0,
  saves           BIGINT  NOT NULL DEFAULT 0,
  sessions        BIGINT  NOT NULL DEFAULT 0,
  revenue_cents   BIGINT  NOT NULL DEFAULT 0
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pxe_observations TO authenticated;
GRANT ALL ON public.pxe_observations TO service_role;
ALTER TABLE public.pxe_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pxe_observations admin all"
  ON public.pxe_observations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_pxe_obs_exp ON public.pxe_observations(experiment_id, variant_id);

-- ---------- results ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pxe_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id   UUID NOT NULL REFERENCES public.pxe_experiments(id) ON DELETE CASCADE,
  winner_variant  UUID REFERENCES public.pxe_variants(id) ON DELETE SET NULL,
  loser_variant   UUID REFERENCES public.pxe_variants(id) ON DELETE SET NULL,
  lift_pct        NUMERIC,
  p_value         NUMERIC,
  confidence      NUMERIC,
  decision        TEXT NOT NULL DEFAULT 'inconclusive', -- winner | loser | inconclusive | stopped
  business_impact TEXT,
  expected_traffic_uplift_pct NUMERIC,
  expected_revenue_uplift_cents BIGINT,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pxe_results TO authenticated;
GRANT ALL ON public.pxe_results TO service_role;
ALTER TABLE public.pxe_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pxe_results admin all"
  ON public.pxe_results FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_pxe_results_exp ON public.pxe_results(experiment_id);

-- ---------- updated_at trigger ----------------------------------------------
CREATE OR REPLACE FUNCTION public.pxe_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_pxe_experiments_touch ON public.pxe_experiments;
CREATE TRIGGER trg_pxe_experiments_touch
  BEFORE UPDATE ON public.pxe_experiments
  FOR EACH ROW EXECUTE FUNCTION public.pxe_touch_updated_at();

-- ---------- dashboard view --------------------------------------------------
CREATE OR REPLACE VIEW public.v_pxe_dashboard AS
WITH obs AS (
  SELECT
    experiment_id, variant_id,
    SUM(pins)          AS pins,
    SUM(impressions)   AS impressions,
    SUM(clicks)        AS clicks,
    SUM(saves)         AS saves,
    SUM(sessions)      AS sessions,
    SUM(revenue_cents) AS revenue_cents
  FROM public.pxe_observations
  GROUP BY experiment_id, variant_id
),
assign AS (
  SELECT experiment_id, variant_id, COUNT(*) AS assigned_pins
  FROM public.pxe_assignments GROUP BY experiment_id, variant_id
)
SELECT
  e.id            AS experiment_id,
  e.code, e.hypothesis, e.dimension, e.metric, e.status,
  e.allocation_pct, e.sample_target, e.confidence_target,
  e.start_at, e.end_at, e.winner_variant, e.result_summary,
  v.id            AS variant_id,
  v.label         AS variant_label,
  v.is_control,
  COALESCE(a.assigned_pins, 0)      AS assigned_pins,
  COALESCE(o.pins, 0)               AS pins,
  COALESCE(o.impressions, 0)        AS impressions,
  COALESCE(o.clicks, 0)             AS clicks,
  COALESCE(o.saves, 0)              AS saves,
  COALESCE(o.sessions, 0)           AS sessions,
  COALESCE(o.revenue_cents, 0)      AS revenue_cents,
  CASE WHEN COALESCE(o.impressions,0) > 0
       THEN ROUND((o.clicks::numeric / o.impressions) * 100, 3) ELSE 0 END AS ctr_pct,
  CASE WHEN COALESCE(o.impressions,0) > 0
       THEN ROUND((o.saves::numeric  / o.impressions) * 100, 3) ELSE 0 END AS save_rate_pct
FROM public.pxe_experiments e
LEFT JOIN public.pxe_variants   v ON v.experiment_id = e.id
LEFT JOIN obs    o ON o.experiment_id = e.id AND o.variant_id = v.id
LEFT JOIN assign a ON a.experiment_id = e.id AND a.variant_id = v.id;

ALTER VIEW public.v_pxe_dashboard SET (security_invoker = true);
GRANT SELECT ON public.v_pxe_dashboard TO authenticated;

-- ---------- seed 10 experiment templates (Phase 2) --------------------------
INSERT INTO public.pxe_experiments (code, hypothesis, dimension, metric, status, allocation_pct, sample_target, notes)
VALUES
  ('title_length_v1',      'Short titles (≤40 chars) outperform long titles (≥70 chars) on CTR.',              'title',   'ctr',                    'template', 10, 200, 'Split within same product pool.'),
  ('question_vs_statement','Question-form titles beat statement titles on save rate.',                          'title',   'saves_per_impression',   'template', 10, 200, NULL),
  ('lifestyle_vs_product', 'Lifestyle scenes outperform product-only scenes on sessions per pin.',             'scene',   'sessions_per_pin',       'template', 10, 200, NULL),
  ('luxury_vs_practical',  'Luxury wording lifts CTR on premium-priced SKUs.',                                 'copy',    'ctr',                    'template', 10, 200, 'Restrict to price ≥ $150.'),
  ('morning_vs_evening',   'Evening publishes (19:00–22:30 ET) beat morning (08:00–10:00 ET) on 7-day CTR.',   'timing',  'ctr',                    'template', 10, 300, NULL),
  ('board_a_vs_board_b',   'Category board beats generic aesthetic board on sessions per pin.',                'board',   'sessions_per_pin',       'template', 10, 200, NULL),
  ('high_vs_low_price',    'High-price pins ($150+) beat low-price pins ($40–$80) on revenue per pin.',        'price',   'revenue_per_pin',        'template', 10, 200, NULL),
  ('animal_vs_product',    'Pins with visible animals beat product-only pins on save rate.',                   'subject', 'saves_per_impression',   'template', 10, 200, NULL),
  ('indoor_vs_outdoor',    'Outdoor scenes outperform indoor scenes in summer months.',                        'scene',   'ctr',                    'template', 10, 200, 'Time-boxed Jun–Aug.'),
  ('editorial_vs_product', 'Editorial roundup pins beat single-product pins on sessions per pin.',             'style',   'sessions_per_pin',       'template', 10, 200, NULL)
ON CONFLICT (code) DO NOTHING;

-- default A/B variants per template
INSERT INTO public.pxe_variants (experiment_id, label, is_control, definition)
SELECT e.id, v.label, v.is_control, v.definition
FROM public.pxe_experiments e
JOIN LATERAL (VALUES
  ('title_length_v1',       'A short (≤40 chars)',      TRUE,  jsonb_build_object('title_max', 40)),
  ('title_length_v1',       'B long (≥70 chars)',       FALSE, jsonb_build_object('title_min', 70)),
  ('question_vs_statement', 'A statement',              TRUE,  jsonb_build_object('form','statement')),
  ('question_vs_statement', 'B question',               FALSE, jsonb_build_object('form','question')),
  ('lifestyle_vs_product',  'A product-only',           TRUE,  jsonb_build_object('scene','product')),
  ('lifestyle_vs_product',  'B lifestyle',              FALSE, jsonb_build_object('scene','lifestyle')),
  ('luxury_vs_practical',   'A practical wording',      TRUE,  jsonb_build_object('tone','practical')),
  ('luxury_vs_practical',   'B luxury wording',         FALSE, jsonb_build_object('tone','luxury')),
  ('morning_vs_evening',    'A morning 08–10 ET',       TRUE,  jsonb_build_object('window','morning')),
  ('morning_vs_evening',    'B evening 19–22 ET',       FALSE, jsonb_build_object('window','evening')),
  ('board_a_vs_board_b',    'A category board',         TRUE,  jsonb_build_object('board_type','category')),
  ('board_a_vs_board_b',    'B aesthetic board',        FALSE, jsonb_build_object('board_type','aesthetic')),
  ('high_vs_low_price',     'A low price $40–$80',      TRUE,  jsonb_build_object('price_min',40,'price_max',80)),
  ('high_vs_low_price',     'B high price $150+',       FALSE, jsonb_build_object('price_min',150)),
  ('animal_vs_product',     'A product visible',        TRUE,  jsonb_build_object('subject','product')),
  ('animal_vs_product',     'B animal visible',         FALSE, jsonb_build_object('subject','animal')),
  ('indoor_vs_outdoor',     'A indoor scene',           TRUE,  jsonb_build_object('scene_env','indoor')),
  ('indoor_vs_outdoor',     'B outdoor scene',          FALSE, jsonb_build_object('scene_env','outdoor')),
  ('editorial_vs_product',  'A single product',         TRUE,  jsonb_build_object('style','product_first')),
  ('editorial_vs_product',  'B editorial roundup',      FALSE, jsonb_build_object('style','editorial'))
) AS v(code, label, is_control, definition) ON v.code = e.code
ON CONFLICT (experiment_id, label) DO NOTHING;
