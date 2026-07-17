
-- 1. Classify runs. Existing rows default to 'publication' so all current behaviour is preserved.
ALTER TABLE public.pinterest_run_config
  ADD COLUMN IF NOT EXISTS run_type TEXT NOT NULL DEFAULT 'publication'
  CHECK (run_type IN ('publication','candidate_scoring'));

CREATE INDEX IF NOT EXISTS idx_pinterest_run_config_run_type
  ON public.pinterest_run_config(run_type);

-- 2. Dedicated result table for the score-only endpoint.
CREATE TABLE IF NOT EXISTS public.pinterest_candidate_score_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.pinterest_run_config(run_id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  species TEXT,
  slug TEXT,
  source_image_url TEXT,
  source_image_hash TEXT,
  gallery_membership_verified BOOLEAN NOT NULL DEFAULT false,
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  scorer_version TEXT,
  occupancy NUMERIC,
  identity_confidence NUMERIC,
  pdp_similarity NUMERIC,
  species_confidence NUMERIC,
  variant_match BOOLEAN,
  color_match BOOLEAN,
  shape_match BOOLEAN,
  watermark_detected BOOLEAN,
  supplier_text_detected BOOLEAN,
  collage_detected BOOLEAN,
  image_decode_status TEXT,
  tier_a_result TEXT NOT NULL DEFAULT 'unknown'
    CHECK (tier_a_result IN ('tier_a_ready','not_ready','unknown')),
  tier_b_potential_result TEXT NOT NULL DEFAULT 'unknown'
    CHECK (tier_b_potential_result IN ('tier_b_canary_candidate','not_eligible','unknown')),
  rejection_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  credits_used NUMERIC NOT NULL DEFAULT 0,
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pinterest_candidate_score_results TO authenticated;
GRANT ALL    ON public.pinterest_candidate_score_results TO service_role;

ALTER TABLE public.pinterest_candidate_score_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read candidate scores" ON public.pinterest_candidate_score_results;
CREATE POLICY "admins read candidate scores"
  ON public.pinterest_candidate_score_results
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_candidate_scores_run_id
  ON public.pinterest_candidate_score_results(run_id);
CREATE INDEX IF NOT EXISTS idx_candidate_scores_product_id
  ON public.pinterest_candidate_score_results(product_id);
CREATE INDEX IF NOT EXISTS idx_candidate_scores_tier_a
  ON public.pinterest_candidate_score_results(tier_a_result);

-- 3. Publication-impossibility guard: block any pinterest_pin_queue insert whose run_id
--    belongs to a candidate_scoring run. Fires BEFORE INSERT so no row is ever written.
CREATE OR REPLACE FUNCTION public.block_candidate_scoring_queue_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_type TEXT;
BEGIN
  IF NEW.run_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT run_type INTO v_run_type
    FROM public.pinterest_run_config
   WHERE run_id = NEW.run_id;
  IF v_run_type = 'candidate_scoring' THEN
    RAISE EXCEPTION
      'candidate_scoring runs may not insert into pinterest_pin_queue (run_id=%)',
      NEW.run_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_candidate_scoring_queue_insert
  ON public.pinterest_pin_queue;
CREATE TRIGGER trg_block_candidate_scoring_queue_insert
  BEFORE INSERT ON public.pinterest_pin_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.block_candidate_scoring_queue_insert();

-- 4. updated_at trigger for the results table.
DROP TRIGGER IF EXISTS trg_candidate_scores_updated_at
  ON public.pinterest_candidate_score_results;
CREATE TRIGGER trg_candidate_scores_updated_at
  BEFORE UPDATE ON public.pinterest_candidate_score_results
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
