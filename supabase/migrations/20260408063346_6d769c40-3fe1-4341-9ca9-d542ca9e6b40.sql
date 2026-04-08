CREATE TABLE IF NOT EXISTS public.pinterest_oauth_states (
  state TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.pinterest_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No public access" ON public.pinterest_oauth_states
  FOR ALL TO anon, authenticated USING (false);
