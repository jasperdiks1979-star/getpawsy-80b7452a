
-- 1) Remove admin SELECT policy on the raw table. service_role policy remains.
DROP POLICY IF EXISTS "Admins can read pinterest connection" ON public.pinterest_connection;

-- 2) Safe admin-only function exposing non-sensitive fields only.
CREATE OR REPLACE FUNCTION public.get_pinterest_connection_admin()
RETURNS TABLE (
  id uuid,
  account_name text,
  account_id text,
  status text,
  scopes text,
  board_count integer,
  token_expires_at timestamptz,
  token_created_at timestamptz,
  last_publish_at timestamptz,
  last_account_status integer,
  last_boards_status integer,
  last_error text,
  updated_at timestamptz,
  created_at timestamptz,
  connected boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pc.id,
    pc.account_name,
    pc.account_id,
    pc.status,
    pc.scopes,
    pc.board_count,
    pc.token_expires_at,
    pc.token_created_at,
    pc.last_publish_at,
    pc.last_account_status,
    pc.last_boards_status,
    pc.last_error,
    pc.updated_at,
    pc.created_at,
    (pc.status = 'connected' AND pc.access_token IS NOT NULL) AS connected
  FROM public.pinterest_connection pc
  WHERE public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY pc.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_pinterest_connection_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pinterest_connection_admin() TO authenticated, service_role;
