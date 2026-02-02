-- Add last_seen_at column to track when a session was last active
ALTER TABLE public.visitor_activity ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create index for efficient querying of recent activity
CREATE INDEX IF NOT EXISTS idx_visitor_activity_last_seen ON public.visitor_activity(last_seen_at DESC);

-- Create a function to update last_seen_at for a session
CREATE OR REPLACE FUNCTION public.update_session_heartbeat(p_session_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update the most recent activity for this session
  UPDATE public.visitor_activity
  SET last_seen_at = now()
  WHERE id = (
    SELECT id FROM public.visitor_activity 
    WHERE session_id = p_session_id 
    ORDER BY created_at DESC 
    LIMIT 1
  );
END;
$$;

-- Grant execute permission to anon users (for tracking)
GRANT EXECUTE ON FUNCTION public.update_session_heartbeat(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.update_session_heartbeat(TEXT) TO authenticated;