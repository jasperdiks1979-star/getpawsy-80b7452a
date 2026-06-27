
DROP POLICY IF EXISTS "Admins can view pinterest connection" ON public.pinterest_connection;

DROP FUNCTION IF EXISTS public.get_pinterest_connection_admin();

CREATE FUNCTION public.get_pinterest_connection_admin()
RETURNS TABLE(
  id uuid, account_name text, account_id text, status text, scopes text,
  board_count integer, token_expires_at timestamp with time zone,
  token_created_at timestamp with time zone, token_prefix text,
  last_publish_at timestamp with time zone, last_account_status integer,
  last_boards_status integer, last_error text,
  updated_at timestamp with time zone, created_at timestamp with time zone,
  connected boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    pc.id, pc.account_name, pc.account_id, pc.status, pc.scopes,
    pc.board_count, pc.token_expires_at, pc.token_created_at, pc.token_prefix,
    pc.last_publish_at, pc.last_account_status, pc.last_boards_status, pc.last_error,
    pc.updated_at, pc.created_at,
    (pc.status = 'connected' AND pc.access_token IS NOT NULL) AS connected
  FROM public.pinterest_connection pc
  WHERE public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY pc.updated_at DESC
  LIMIT 1
$function$;

GRANT EXECUTE ON FUNCTION public.get_pinterest_connection_admin() TO authenticated;
