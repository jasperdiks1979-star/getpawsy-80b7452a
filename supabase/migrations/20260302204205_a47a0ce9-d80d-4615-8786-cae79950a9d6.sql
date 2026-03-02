
-- Table to store OAuth tokens (encrypted refresh token, access token metadata)
CREATE TABLE public.merchant_oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  encrypted_refresh_token text NOT NULL,
  access_token_expires_at timestamptz,
  token_created_at timestamptz NOT NULL DEFAULT now(),
  token_refreshed_at timestamptz NOT NULL DEFAULT now(),
  merchant_center_id text,
  scopes text[] DEFAULT ARRAY['https://www.googleapis.com/auth/content'],
  is_connected boolean NOT NULL DEFAULT true,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.merchant_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage merchant tokens"
  ON public.merchant_oauth_tokens
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_merchant_oauth_tokens_updated_at
  BEFORE UPDATE ON public.merchant_oauth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Table to store sync logs
CREATE TABLE public.merchant_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'running',
  total_products integer,
  products_with_issues integer,
  issues_summary jsonb,
  account_info jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  triggered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.merchant_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view merchant sync logs"
  ON public.merchant_sync_logs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Table to store PKCE state temporarily
CREATE TABLE public.merchant_oauth_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL UNIQUE,
  code_verifier text NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

ALTER TABLE public.merchant_oauth_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage oauth state"
  ON public.merchant_oauth_state
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
