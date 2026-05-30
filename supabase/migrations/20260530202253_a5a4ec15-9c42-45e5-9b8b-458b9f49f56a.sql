
-- Cinematic Ads safety overhaul: preflight, QA summary, publish gate, render budget.
-- Additive only. No destructive ALTERs. Preserves all existing data.

-- 1. New columns on cinematic_ad_jobs
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS preflight_status text NOT NULL DEFAULT 'not_run',
  ADD COLUMN IF NOT EXISTS preflight_reasons text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preflight_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS creative_plan jsonb,
  ADD COLUMN IF NOT EXISTS qa_passed boolean,
  ADD COLUMN IF NOT EXISTS qa_score integer,
  ADD COLUMN IF NOT EXISTS qa_reasons text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS legacy_unverified boolean NOT NULL DEFAULT false;

-- preflight_status: 'not_run' | 'pass' | 'fail'
ALTER TABLE public.cinematic_ad_jobs DROP CONSTRAINT IF EXISTS cinematic_ad_jobs_preflight_status_chk;
ALTER TABLE public.cinematic_ad_jobs
  ADD CONSTRAINT cinematic_ad_jobs_preflight_status_chk
  CHECK (preflight_status IN ('not_run','pass','fail'));

-- Computed field: is_safe_to_publish (true only when all gates pass)
-- Done as a generated column-equivalent VIEW since we want it derivable, not stored.
-- For simple WHERE clauses in admin UI, expose it as an actual column kept in sync:
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS is_safe_to_publish boolean NOT NULL DEFAULT false;

-- Trigger keeps is_safe_to_publish accurate on every row write
CREATE OR REPLACE FUNCTION public.cinematic_ad_jobs_compute_safe_to_publish()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.is_safe_to_publish := (
    COALESCE(NEW.preflight_status, 'not_run') = 'pass'
    AND COALESCE(NEW.qa_passed, false) = true
    AND NEW.output_mp4_url IS NOT NULL
    AND NEW.legacy_unverified = false
    AND COALESCE(NEW.blocked_reason, '') = ''
    AND NEW.status IN ('approved','publishable','rendered_pending_qa')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cinematic_ad_jobs_safe_to_publish ON public.cinematic_ad_jobs;
CREATE TRIGGER trg_cinematic_ad_jobs_safe_to_publish
BEFORE INSERT OR UPDATE ON public.cinematic_ad_jobs
FOR EACH ROW EXECUTE FUNCTION public.cinematic_ad_jobs_compute_safe_to_publish();

-- 2. Render budget table (1 expensive render per product per 24h)
CREATE TABLE IF NOT EXISTS public.cinematic_ad_render_budget (
  product_slug text PRIMARY KEY,
  last_expensive_render_at timestamptz NOT NULL DEFAULT now(),
  render_count_24h integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cinematic_ad_render_budget TO authenticated;
GRANT ALL ON public.cinematic_ad_render_budget TO service_role;

ALTER TABLE public.cinematic_ad_render_budget ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read render budget" ON public.cinematic_ad_render_budget;
CREATE POLICY "Admins read render budget"
ON public.cinematic_ad_render_budget
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Helper RPC: try to reserve a render slot for a product
CREATE OR REPLACE FUNCTION public.cinematic_reserve_render_slot(
  p_product_slug text,
  p_force boolean DEFAULT false
)
RETURNS TABLE (allowed boolean, reason text, last_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last timestamptz;
BEGIN
  SELECT last_expensive_render_at INTO v_last
  FROM public.cinematic_ad_render_budget
  WHERE product_slug = p_product_slug;

  IF v_last IS NOT NULL AND v_last > now() - interval '24 hours' AND NOT p_force THEN
    RETURN QUERY SELECT false, 'budget_24h_exhausted'::text, v_last;
    RETURN;
  END IF;

  INSERT INTO public.cinematic_ad_render_budget (product_slug, last_expensive_render_at, render_count_24h, updated_at)
  VALUES (p_product_slug, now(), 1, now())
  ON CONFLICT (product_slug) DO UPDATE
    SET last_expensive_render_at = now(),
        render_count_24h = CASE
          WHEN public.cinematic_ad_render_budget.last_expensive_render_at > now() - interval '24 hours'
          THEN public.cinematic_ad_render_budget.render_count_24h + 1
          ELSE 1
        END,
        updated_at = now();

  RETURN QUERY SELECT true, 'reserved'::text, now();
END;
$$;

REVOKE ALL ON FUNCTION public.cinematic_reserve_render_slot(text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.cinematic_reserve_render_slot(text, boolean) TO service_role;

-- 3. Helpful index for admin filters
CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_preflight_status ON public.cinematic_ad_jobs(preflight_status);
CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_safe_to_publish ON public.cinematic_ad_jobs(is_safe_to_publish);
CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_status_updated ON public.cinematic_ad_jobs(status, updated_at DESC);
