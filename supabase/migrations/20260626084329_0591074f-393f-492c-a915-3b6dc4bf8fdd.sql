
-- Add family + visual_fingerprint columns to creatives so we can index on them
ALTER TABLE public.pcie2_creatives
  ADD COLUMN IF NOT EXISTS family text,
  ADD COLUMN IF NOT EXISTS visual_fingerprint text,
  ADD COLUMN IF NOT EXISTS concept_node_id uuid,
  ADD COLUMN IF NOT EXISTS mutation_path jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Drop the legacy 2-key unique index; replace with 4-key partial unique
DROP INDEX IF EXISTS public.pcie2_creatives_product_concept_uq;
CREATE UNIQUE INDEX IF NOT EXISTS pcie2_creatives_pcfv_uq
  ON public.pcie2_creatives (product_id, concept, family, visual_fingerprint)
  WHERE retired = false AND concept IS NOT NULL;

-- Restore claim RPC to original signature so the existing worker keeps working
DROP FUNCTION IF EXISTS public.pcie2_claim_creative_jobs(integer, uuid);
CREATE OR REPLACE FUNCTION public.pcie2_claim_creative_jobs(p_limit int DEFAULT 8, p_token uuid DEFAULT gen_random_uuid())
RETURNS SETOF public.pcie2_creative_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.pcie2_creative_jobs j
  SET status='running', claim_token=p_token, claimed_at=now(), updated_at=now(), attempts=COALESCE(j.attempts,0)+1
  WHERE j.id IN (
    SELECT id FROM public.pcie2_creative_jobs
    WHERE status='queued'
       OR (status='running' AND claimed_at < now() - interval '5 minutes')
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING j.*;
END;
$$;
REVOKE ALL ON FUNCTION public.pcie2_claim_creative_jobs(int, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pcie2_claim_creative_jobs(int, uuid) TO service_role;
