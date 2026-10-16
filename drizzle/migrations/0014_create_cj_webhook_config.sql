CREATE TABLE public.cj_webhook_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.cj_webhook_config TO service_role;

ALTER TABLE public.cj_webhook_config ENABLE ROW LEVEL SECURITY;

-- No policies: only the service role (edge functions) can read or write.
-- The openId stored here is the HMAC key for CJ webhook signatures and must
-- never be readable by anon or authenticated clients.