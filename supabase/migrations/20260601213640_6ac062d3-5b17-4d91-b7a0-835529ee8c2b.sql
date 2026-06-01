
-- 1. New columns on cinematic_ad_jobs for admin force-render override
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS force_render_budget_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS force_render_budget_reason text,
  ADD COLUMN IF NOT EXISTS force_render_budget_by uuid;

-- 2. New columns on budget table to record overrides
ALTER TABLE public.cinematic_ad_render_budget
  ADD COLUMN IF NOT EXISTS force_override_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_force_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_force_by uuid;

-- 3. Rewrite reserve RPC to also surface reset_at + log overrides
DROP FUNCTION IF EXISTS public.cinematic_reserve_render_slot(text, boolean);

CREATE OR REPLACE FUNCTION public.cinematic_reserve_render_slot(
  p_product_slug text,
  p_force boolean DEFAULT false,
  p_admin_user_id uuid DEFAULT NULL,
  p_force_reason text DEFAULT NULL
)
RETURNS TABLE (allowed boolean, reason text, last_at timestamptz, reset_at timestamptz, forced boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last timestamptz;
  v_reset timestamptz;
BEGIN
  SELECT last_expensive_render_at INTO v_last
  FROM public.cinematic_ad_render_budget
  WHERE product_slug = p_product_slug;

  v_reset := CASE WHEN v_last IS NULL THEN now() ELSE v_last + interval '24 hours' END;

  IF v_last IS NOT NULL AND v_last > now() - interval '24 hours' AND NOT p_force THEN
    RETURN QUERY SELECT false, 'budget_24h_exhausted'::text, v_last, v_reset, false;
    RETURN;
  END IF;

  INSERT INTO public.cinematic_ad_render_budget (
    product_slug, last_expensive_render_at, render_count_24h, updated_at,
    force_override_count, last_force_at, last_force_by
  )
  VALUES (
    p_product_slug, now(), 1, now(),
    CASE WHEN p_force THEN 1 ELSE 0 END,
    CASE WHEN p_force THEN now() ELSE NULL END,
    CASE WHEN p_force THEN p_admin_user_id ELSE NULL END
  )
  ON CONFLICT (product_slug) DO UPDATE
    SET last_expensive_render_at = now(),
        render_count_24h = CASE
          WHEN public.cinematic_ad_render_budget.last_expensive_render_at > now() - interval '24 hours'
          THEN public.cinematic_ad_render_budget.render_count_24h + 1
          ELSE 1
        END,
        force_override_count = public.cinematic_ad_render_budget.force_override_count
          + CASE WHEN p_force THEN 1 ELSE 0 END,
        last_force_at = CASE WHEN p_force THEN now() ELSE public.cinematic_ad_render_budget.last_force_at END,
        last_force_by = CASE WHEN p_force THEN p_admin_user_id ELSE public.cinematic_ad_render_budget.last_force_by END,
        updated_at = now();

  RETURN QUERY SELECT true,
    CASE WHEN p_force THEN 'reserved_force'::text ELSE 'reserved'::text END,
    now(),
    now() + interval '24 hours',
    p_force;
END;
$$;

REVOKE ALL ON FUNCTION public.cinematic_reserve_render_slot(text, boolean, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.cinematic_reserve_render_slot(text, boolean, uuid, text) TO service_role;

-- 4. Admin RPC to clear / reset a product's budget from the dashboard
CREATE OR REPLACE FUNCTION public.cinematic_clear_render_budget(
  p_product_slug text,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (cleared boolean, previous_last_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  SELECT last_expensive_render_at INTO v_prev
  FROM public.cinematic_ad_render_budget
  WHERE product_slug = p_product_slug;

  DELETE FROM public.cinematic_ad_render_budget WHERE product_slug = p_product_slug;

  RETURN QUERY SELECT true, v_prev;
END;
$$;

REVOKE ALL ON FUNCTION public.cinematic_clear_render_budget(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.cinematic_clear_render_budget(text, text) TO authenticated, service_role;

-- 5. Admin-only status view exposing reset_at alongside counts
CREATE OR REPLACE VIEW public.cinematic_ad_render_budget_status
WITH (security_invoker = on) AS
SELECT
  product_slug,
  last_expensive_render_at,
  render_count_24h,
  force_override_count,
  last_force_at,
  last_force_by,
  updated_at,
  last_expensive_render_at + interval '24 hours' AS reset_at,
  GREATEST(0, EXTRACT(EPOCH FROM ((last_expensive_render_at + interval '24 hours') - now()))::bigint) AS seconds_until_reset,
  (last_expensive_render_at > now() - interval '24 hours') AS currently_blocked
FROM public.cinematic_ad_render_budget;

GRANT SELECT ON public.cinematic_ad_render_budget_status TO authenticated;
GRANT ALL ON public.cinematic_ad_render_budget_status TO service_role;

-- 6. Index to speed admin dashboard filters
CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_force_override
  ON public.cinematic_ad_jobs(force_render_budget_override)
  WHERE force_render_budget_override = true;
