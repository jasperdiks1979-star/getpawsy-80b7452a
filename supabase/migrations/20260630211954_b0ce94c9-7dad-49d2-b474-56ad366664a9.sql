
CREATE TABLE IF NOT EXISTS public.ai_prompt_cache (
  cache_key TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  function_name TEXT,
  product_slug TEXT,
  response_json JSONB NOT NULL,
  hit_count INT NOT NULL DEFAULT 0,
  credits_saved_estimate NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_hit_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ai_prompt_cache_expires_idx ON public.ai_prompt_cache(expires_at);
CREATE INDEX IF NOT EXISTS ai_prompt_cache_product_idx ON public.ai_prompt_cache(product_slug);
GRANT SELECT ON public.ai_prompt_cache TO authenticated;
GRANT ALL ON public.ai_prompt_cache TO service_role;
ALTER TABLE public.ai_prompt_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read ai_prompt_cache" ON public.ai_prompt_cache FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service write ai_prompt_cache" ON public.ai_prompt_cache FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.ai_generation_locks (
  product_slug TEXT NOT NULL,
  lane TEXT NOT NULL,
  run_id TEXT NOT NULL,
  function_name TEXT,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (product_slug, lane)
);
CREATE INDEX IF NOT EXISTS ai_generation_locks_expires_idx ON public.ai_generation_locks(expires_at);
GRANT SELECT ON public.ai_generation_locks TO authenticated;
GRANT ALL ON public.ai_generation_locks TO service_role;
ALTER TABLE public.ai_generation_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read locks" ON public.ai_generation_locks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service write locks" ON public.ai_generation_locks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.ai_probe_backoff_state (
  id INT PRIMARY KEY DEFAULT 1,
  consecutive_failures INT NOT NULL DEFAULT 0,
  next_allowed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ,
  last_status_code INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);
INSERT INTO public.ai_probe_backoff_state(id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT SELECT ON public.ai_probe_backoff_state TO authenticated;
GRANT ALL ON public.ai_probe_backoff_state TO service_role;
ALTER TABLE public.ai_probe_backoff_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read probe state" ON public.ai_probe_backoff_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service write probe state" ON public.ai_probe_backoff_state FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.purge_expired_ai_cache() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
  DELETE FROM public.ai_prompt_cache WHERE expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.ai_generation_locks WHERE expires_at < now();
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.purge_expired_ai_cache() TO service_role;
