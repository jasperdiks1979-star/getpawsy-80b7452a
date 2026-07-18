CREATE TABLE public.pinterest_publish_preflight_audits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trace_id UUID NOT NULL,
  product_slug TEXT NOT NULL,
  product_id UUID NULL,
  board_id TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  image_hash TEXT NULL,
  idempotency_key TEXT NULL,
  preflight_pass BOOLEAN NOT NULL,
  failed_gates TEXT[] NOT NULL DEFAULT '{}',
  gates JSONB NOT NULL DEFAULT '[]'::jsonb,
  executed BOOLEAN NOT NULL DEFAULT false,
  publisher_function TEXT NULL,
  publisher_status INT NULL,
  publisher_body JSONB NULL,
  pinterest_pin_id TEXT NULL,
  pin_url TEXT NULL,
  public_verified BOOLEAN NULL,
  public_verification_detail TEXT NULL,
  verdict TEXT NOT NULL
);

CREATE INDEX pinterest_publish_preflight_audits_created_idx
  ON public.pinterest_publish_preflight_audits (created_at DESC);
CREATE INDEX pinterest_publish_preflight_audits_trace_idx
  ON public.pinterest_publish_preflight_audits (trace_id);
CREATE INDEX pinterest_publish_preflight_audits_slug_idx
  ON public.pinterest_publish_preflight_audits (product_slug, created_at DESC);

GRANT SELECT ON public.pinterest_publish_preflight_audits TO authenticated;
GRANT ALL ON public.pinterest_publish_preflight_audits TO service_role;

ALTER TABLE public.pinterest_publish_preflight_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read preflight audits"
  ON public.pinterest_publish_preflight_audits
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));