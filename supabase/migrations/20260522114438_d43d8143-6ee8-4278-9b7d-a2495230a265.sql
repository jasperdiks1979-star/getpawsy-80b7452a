CREATE TABLE IF NOT EXISTS public.pinterest_pin_deletion_verifications (
  id uuid primary key default gen_random_uuid(),
  pinterest_pin_id text not null,
  queue_id uuid,
  status text not null check (status in ('deleted','still_exists','inaccessible','cached_only')),
  http_status int,
  error text,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pinterest_pin_deletion_verifications_pin_idx
  ON public.pinterest_pin_deletion_verifications (pinterest_pin_id);

CREATE INDEX IF NOT EXISTS pinterest_pin_deletion_verifications_verified_at_idx
  ON public.pinterest_pin_deletion_verifications (verified_at DESC);

ALTER TABLE public.pinterest_pin_deletion_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage deletion verifications"
  ON public.pinterest_pin_deletion_verifications
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));