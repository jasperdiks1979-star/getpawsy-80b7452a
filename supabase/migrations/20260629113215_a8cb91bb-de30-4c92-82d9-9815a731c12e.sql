-- Prevent customers (dispute owners) from reading internal admin notes via column-level privilege.
-- RLS is row-scoped; column-level GRANTs restrict which columns the `authenticated` role can read.
REVOKE SELECT (admin_notes) ON public.disputes FROM authenticated;
REVOKE SELECT (admin_notes) ON public.disputes FROM anon;
-- service_role retains full access via GRANT ALL elsewhere; admin UIs that need this field
-- should query it through an edge function / service_role context or a SECURITY DEFINER RPC.

CREATE OR REPLACE FUNCTION public.get_dispute_admin_notes(_dispute_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT admin_notes
  FROM public.disputes
  WHERE id = _dispute_id
    AND public.has_role(auth.uid(), 'admin'::app_role);
$$;

REVOKE ALL ON FUNCTION public.get_dispute_admin_notes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dispute_admin_notes(uuid) TO authenticated, service_role;