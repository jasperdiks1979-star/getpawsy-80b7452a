-- 1. New columns for Director batching
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS concept_type   text,
  ADD COLUMN IF NOT EXISTS concept_index  integer,
  ADD COLUMN IF NOT EXISTS superseded_at  timestamptz;

-- 2. Backfill concept_type from director_archetype where available
UPDATE public.cinematic_ad_jobs
SET concept_type = director_archetype
WHERE concept_type IS NULL AND director_archetype IS NOT NULL;

-- 3. Supersede stale active jobs (>2h) so the new index can build cleanly
UPDATE public.cinematic_ad_jobs
SET status = 'failed',
    superseded_at = now(),
    error_message = COALESCE(error_message, 'auto-superseded: stale active job > 2h'),
    status_message = 'superseded by director batching upgrade'
WHERE status IN ('pending','preparing','prepared','render_queued','rendering')
  AND updated_at < now() - interval '2 hours';

-- 4. Deduplicate any remaining active collisions BEFORE swapping the index
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY product_slug,
                        COALESCE(director_run_id::text, 'solo'),
                        COALESCE(concept_type, director_archetype, 'default')
           ORDER BY updated_at DESC, created_at DESC
         ) AS rn
  FROM public.cinematic_ad_jobs
  WHERE status IN ('pending','preparing','prepared','render_queued','rendering')
)
UPDATE public.cinematic_ad_jobs c
SET status = 'failed',
    superseded_at = now(),
    error_message = COALESCE(c.error_message, 'auto-superseded: duplicate active pre-director-batching'),
    status_message = 'superseded'
FROM ranked r
WHERE c.id = r.id AND r.rn > 1;

-- 5. Drop the too-strict index (blocks 4 parallel concepts under one product_slug)
DROP INDEX IF EXISTS public.uniq_cinematic_active_product_slug;

-- 6. New uniqueness: one active job per (product_slug, director_run, concept_type)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cinematic_active_concept
ON public.cinematic_ad_jobs (
  product_slug,
  COALESCE(director_run_id::text, 'solo'),
  COALESCE(concept_type, director_archetype, 'default')
)
WHERE status IN ('pending','preparing','prepared','render_queued','rendering')
  AND superseded_at IS NULL;

-- 7. Lookup helper for director runs
CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_director_run
ON public.cinematic_ad_jobs (director_run_id)
WHERE director_run_id IS NOT NULL;