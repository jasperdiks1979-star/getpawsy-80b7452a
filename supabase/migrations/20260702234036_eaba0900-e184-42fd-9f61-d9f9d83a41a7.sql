-- Restrict SELECT on ceo_kill_switch_state to admins only.
-- Expose only public-safe fields (status, updated_at) through a security-invoker
-- view for storefront/anonymous use. Prevents leakage of triggered_by, reason,
-- evidence, and golden_run_id.

DROP POLICY IF EXISTS "kill_switch_read_all" ON public.ceo_kill_switch_state;

CREATE POLICY "kill_switch_admin_read"
  ON public.ceo_kill_switch_state
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Public-safe view: only status + updated_at, no operational detail.
CREATE OR REPLACE VIEW public.ceo_kill_switch_public
  WITH (security_invoker = true) AS
SELECT status, updated_at
FROM public.ceo_kill_switch_state
WHERE singleton = true;

GRANT SELECT ON public.ceo_kill_switch_public TO anon, authenticated;