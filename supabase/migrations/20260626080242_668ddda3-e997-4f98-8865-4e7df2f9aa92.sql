
-- Queue table
CREATE TABLE IF NOT EXISTS public.pcie2_creative_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL,
  concept text NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- queued|processing|done|failed|skipped
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  claim_token uuid,
  claimed_at timestamptz,
  completed_at timestamptz,
  creative_id uuid REFERENCES public.pcie2_creatives(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pcie2_creative_jobs_uq ON public.pcie2_creative_jobs(product_id, concept);
CREATE INDEX IF NOT EXISTS pcie2_creative_jobs_status_idx ON public.pcie2_creative_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS pcie2_creative_jobs_claim_idx ON public.pcie2_creative_jobs(claim_token);

GRANT SELECT ON public.pcie2_creative_jobs TO authenticated;
GRANT ALL ON public.pcie2_creative_jobs TO service_role;
ALTER TABLE public.pcie2_creative_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcie2_jobs_admin_read" ON public.pcie2_creative_jobs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER pcie2_jobs_updated BEFORE UPDATE ON public.pcie2_creative_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Idempotency on creatives: one creative per (product, concept) while active
CREATE UNIQUE INDEX IF NOT EXISTS pcie2_creatives_product_concept_uq
  ON public.pcie2_creatives(product_id, concept)
  WHERE retired = false AND concept IS NOT NULL;

-- Claim function: atomically claim up to p_limit queued/stuck jobs
CREATE OR REPLACE FUNCTION public.pcie2_claim_creative_jobs(p_limit int, p_token uuid)
RETURNS SETOF public.pcie2_creative_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.pcie2_creative_jobs
    WHERE status = 'queued'
       OR (status = 'processing' AND claimed_at < now() - interval '3 minutes')
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.pcie2_creative_jobs j
     SET status = 'processing',
         claim_token = p_token,
         claimed_at = now(),
         attempts = j.attempts + 1
    FROM picked
   WHERE j.id = picked.id
   RETURNING j.*;
END;
$$;

-- Seed function: enqueue (product, concept) jobs for every active product
CREATE OR REPLACE FUNCTION public.pcie2_enqueue_creative_jobs(p_concepts text[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.pcie2_creative_jobs (product_id, concept)
  SELECT p.id, c
    FROM public.products p
    CROSS JOIN unnest(p_concepts) AS c
   WHERE p.is_active = true
  ON CONFLICT (product_id, concept) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.pcie2_claim_creative_jobs(int, uuid) FROM public;
REVOKE ALL ON FUNCTION public.pcie2_enqueue_creative_jobs(text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.pcie2_claim_creative_jobs(int, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pcie2_enqueue_creative_jobs(text[]) TO service_role;
