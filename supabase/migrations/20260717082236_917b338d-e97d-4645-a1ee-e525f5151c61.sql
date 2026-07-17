
-- ─────────────────────────────────────────────────────────────
-- 1. Add stable_key to pinterest_candidate_score_results
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.pinterest_candidate_score_results
  ADD COLUMN IF NOT EXISTS stable_key text;

-- Backfill any existing NULLs deterministically
UPDATE public.pinterest_candidate_score_results
   SET stable_key = run_id::text
                 || '|' || product_id::text
                 || '|' || COALESCE(source_image_hash, '')
                 || '|' || COALESCE(scorer_version, '')
 WHERE stable_key IS NULL;

-- Enforce NOT NULL + concrete unique constraint (PostgREST-safe for onConflict)
ALTER TABLE public.pinterest_candidate_score_results
  ALTER COLUMN stable_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pinterest_candidate_score_results_stable_key_unique'
  ) THEN
    ALTER TABLE public.pinterest_candidate_score_results
      ADD CONSTRAINT pinterest_candidate_score_results_stable_key_unique
      UNIQUE (stable_key);
  END IF;
END$$;

-- Trigger to keep stable_key in sync on insert/update
CREATE OR REPLACE FUNCTION public.pinterest_candidate_score_results_set_stable_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.stable_key := NEW.run_id::text
                 || '|' || NEW.product_id::text
                 || '|' || COALESCE(NEW.source_image_hash, '')
                 || '|' || COALESCE(NEW.scorer_version, '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pinterest_candidate_score_results_stable_key
  ON public.pinterest_candidate_score_results;
CREATE TRIGGER trg_pinterest_candidate_score_results_stable_key
BEFORE INSERT OR UPDATE ON public.pinterest_candidate_score_results
FOR EACH ROW EXECUTE FUNCTION public.pinterest_candidate_score_results_set_stable_key();

-- ─────────────────────────────────────────────────────────────
-- 2. pinterest_candidate_run_items — durable disposition per requested candidate
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pinterest_candidate_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  ordinal integer NOT NULL,
  product_id uuid NOT NULL,
  species text,
  source_image_url text,
  source_image_hash text,
  disposition text NOT NULL DEFAULT 'REQUESTED',
  cache_status text,
  evaluator_version text,
  tier_a_result text,
  tier_b_result text,
  rejection_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  numeric_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  categorical_decisions jsonb NOT NULL DEFAULT '{}'::jsonb,
  credits_used numeric NOT NULL DEFAULT 0,
  provider_call_count integer NOT NULL DEFAULT 0,
  error_code text,
  error_message text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pinterest_candidate_run_items_disposition_ck CHECK (
    disposition IN (
      'REQUESTED',
      'PREFILTER_REJECTED',
      'CACHE_HIT_TIER_A',
      'CACHE_HIT_TIER_B',
      'CACHE_HIT_REJECTED',
      'SCORED_TIER_A',
      'SCORED_TIER_B',
      'SCORED_REJECTED',
      'MISSING_SOURCE',
      'PROVIDER_FAILED',
      'BUDGET_STOPPED',
      'TECHNICAL_ERROR'
    )
  ),
  CONSTRAINT pinterest_candidate_run_items_run_product_unique
    UNIQUE (run_id, product_id)
);

-- Grants: no anon; authenticated may attempt SELECT (RLS admin-filters); service_role full
REVOKE ALL ON public.pinterest_candidate_run_items FROM PUBLIC;
REVOKE ALL ON public.pinterest_candidate_run_items FROM anon;
REVOKE ALL ON public.pinterest_candidate_run_items FROM authenticated;
GRANT SELECT ON public.pinterest_candidate_run_items TO authenticated;
GRANT ALL   ON public.pinterest_candidate_run_items TO service_role;

ALTER TABLE public.pinterest_candidate_run_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read candidate run items"
  ON public.pinterest_candidate_run_items;
CREATE POLICY "admins read candidate run items"
  ON public.pinterest_candidate_run_items
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Indexes
CREATE INDEX IF NOT EXISTS pinterest_candidate_run_items_run_idx
  ON public.pinterest_candidate_run_items (run_id);
CREATE INDEX IF NOT EXISTS pinterest_candidate_run_items_product_idx
  ON public.pinterest_candidate_run_items (product_id);
CREATE INDEX IF NOT EXISTS pinterest_candidate_run_items_disposition_idx
  ON public.pinterest_candidate_run_items (disposition);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.pinterest_candidate_run_items_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pinterest_candidate_run_items_touch
  ON public.pinterest_candidate_run_items;
CREATE TRIGGER trg_pinterest_candidate_run_items_touch
BEFORE UPDATE ON public.pinterest_candidate_run_items
FOR EACH ROW EXECUTE FUNCTION public.pinterest_candidate_run_items_touch();
