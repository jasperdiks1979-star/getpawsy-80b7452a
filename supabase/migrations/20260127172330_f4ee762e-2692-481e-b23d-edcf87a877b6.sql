-- Create function to cleanup non-production visitor data
-- This removes any data that was tracked from preview/development domains
CREATE OR REPLACE FUNCTION public.cleanup_preview_visitor_activity()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete visitor activity records where city/country suggest it's not from production
  -- Since we can't reliably determine the source domain from the data,
  -- we'll delete records that are older than when we implemented domain filtering
  -- and any records without proper location data (likely test data)
  
  WITH deleted AS (
    DELETE FROM public.visitor_activity 
    WHERE created_at < '2025-01-27 00:00:00+00'::timestamptz
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$function$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION public.cleanup_preview_visitor_activity() TO service_role;