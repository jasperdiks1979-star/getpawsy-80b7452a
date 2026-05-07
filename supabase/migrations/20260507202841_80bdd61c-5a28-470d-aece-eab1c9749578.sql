CREATE TABLE IF NOT EXISTS public.pinterest_debug_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  label text,
  minted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  minted_by_email text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pinterest_debug_tokens_hash ON public.pinterest_debug_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_pinterest_debug_tokens_minted_by ON public.pinterest_debug_tokens(minted_by);

ALTER TABLE public.pinterest_debug_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view their debug tokens"
ON public.pinterest_debug_tokens
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND minted_by = auth.uid());