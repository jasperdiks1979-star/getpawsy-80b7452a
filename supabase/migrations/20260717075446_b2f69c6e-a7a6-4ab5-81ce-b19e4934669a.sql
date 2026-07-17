
-- Dedupe legacy canary duplicates, keeping the newest row per stable key.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY run_id, product_id,
                        COALESCE(source_image_hash, ''),
                        COALESCE(scorer_version, '')
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.pinterest_candidate_score_results
)
DELETE FROM public.pinterest_candidate_score_results r
USING ranked
WHERE r.id = ranked.id AND ranked.rn > 1;

-- Grants.
GRANT SELECT ON public.pinterest_candidate_score_results TO authenticated;
GRANT ALL   ON public.pinterest_candidate_score_results TO service_role;

-- Stable-key uniqueness (idempotent upsert target).
CREATE UNIQUE INDEX IF NOT EXISTS pinterest_candidate_score_results_stable_key
  ON public.pinterest_candidate_score_results (
    run_id,
    product_id,
    COALESCE(source_image_hash, ''),
    COALESCE(scorer_version, '')
  );

-- Query indexes.
CREATE INDEX IF NOT EXISTS pinterest_candidate_score_results_run_id_idx
  ON public.pinterest_candidate_score_results (run_id);
CREATE INDEX IF NOT EXISTS pinterest_candidate_score_results_tier_a_idx
  ON public.pinterest_candidate_score_results (tier_a_result);
CREATE INDEX IF NOT EXISTS pinterest_candidate_score_results_species_idx
  ON public.pinterest_candidate_score_results (species);
CREATE INDEX IF NOT EXISTS pinterest_candidate_score_results_product_idx
  ON public.pinterest_candidate_score_results (product_id);

-- Persistence-failure tracking on the run config.
ALTER TABLE public.pinterest_run_config
  ADD COLUMN IF NOT EXISTS persistence_failed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS persistence_failure_reason text;
