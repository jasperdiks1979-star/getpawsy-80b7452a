-- Create rate limits table to track API usage
CREATE TABLE public.rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  function_name TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, function_name)
);

-- Enable RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (edge functions use service role)
CREATE POLICY "Service role only" ON public.rate_limits
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Create index for faster lookups
CREATE INDEX idx_rate_limits_user_function ON public.rate_limits(user_id, function_name);

-- Create function to check and update rate limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_function_name TEXT,
  p_max_requests INTEGER DEFAULT 60,
  p_window_minutes INTEGER DEFAULT 60
)
RETURNS TABLE(allowed BOOLEAN, remaining INTEGER, reset_at TIMESTAMP WITH TIME ZONE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMP WITH TIME ZONE;
  v_request_count INTEGER;
  v_reset_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Calculate window boundaries
  v_window_start := now() - (p_window_minutes || ' minutes')::INTERVAL;
  
  -- Try to get existing rate limit record
  SELECT rl.request_count, rl.window_start INTO v_request_count, v_reset_at
  FROM rate_limits rl
  WHERE rl.user_id = p_user_id AND rl.function_name = p_function_name;
  
  -- If no record exists or window has expired, create/reset
  IF NOT FOUND OR v_reset_at < v_window_start THEN
    INSERT INTO rate_limits (user_id, function_name, request_count, window_start, updated_at)
    VALUES (p_user_id, p_function_name, 1, now(), now())
    ON CONFLICT (user_id, function_name) 
    DO UPDATE SET request_count = 1, window_start = now(), updated_at = now();
    
    RETURN QUERY SELECT true, p_max_requests - 1, now() + (p_window_minutes || ' minutes')::INTERVAL;
    RETURN;
  END IF;
  
  -- Check if limit exceeded
  IF v_request_count >= p_max_requests THEN
    RETURN QUERY SELECT false, 0, v_reset_at + (p_window_minutes || ' minutes')::INTERVAL;
    RETURN;
  END IF;
  
  -- Increment counter
  UPDATE rate_limits 
  SET request_count = request_count + 1, updated_at = now()
  WHERE user_id = p_user_id AND function_name = p_function_name;
  
  RETURN QUERY SELECT true, p_max_requests - v_request_count - 1, v_reset_at + (p_window_minutes || ' minutes')::INTERVAL;
END;
$$;

-- Trigger for updated_at
CREATE TRIGGER update_rate_limits_updated_at
  BEFORE UPDATE ON public.rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();