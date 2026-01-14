-- Create a table to cache CJ API tokens
CREATE TABLE public.cj_token_cache (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  access_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS but allow edge functions to access
ALTER TABLE public.cj_token_cache ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (edge functions use service role)
CREATE POLICY "Service role only" ON public.cj_token_cache
  FOR ALL USING (auth.role() = 'service_role');