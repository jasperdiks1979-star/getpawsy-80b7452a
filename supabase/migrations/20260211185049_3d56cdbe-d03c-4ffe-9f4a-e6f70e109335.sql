
-- Fix the overly permissive policy on gsc_sync_runs
DROP POLICY IF EXISTS "Service role can manage sync runs" ON public.gsc_sync_runs;

-- Edge functions use service role which bypasses RLS, so we only need the admin SELECT policy
-- No additional INSERT/UPDATE policy needed for regular users
CREATE POLICY "Admins can manage sync runs"
  ON public.gsc_sync_runs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
