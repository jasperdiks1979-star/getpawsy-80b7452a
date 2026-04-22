-- TikTok OAuth tokens storage (single row per account)
CREATE TABLE IF NOT EXISTS public.tiktok_oauth_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  open_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  scope TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  refresh_expires_at TIMESTAMP WITH TIME ZONE,
  connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tiktok_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Only admins can read tokens (via has_role)
CREATE POLICY "Admins can view tiktok tokens"
ON public.tiktok_oauth_tokens
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete tiktok tokens"
ON public.tiktok_oauth_tokens
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Inserts/updates only via service role (edge function)

CREATE TRIGGER update_tiktok_oauth_tokens_updated_at
BEFORE UPDATE ON public.tiktok_oauth_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Short-lived OAuth state for CSRF protection
CREATE TABLE IF NOT EXISTS public.tiktok_oauth_states (
  state TEXT NOT NULL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_to TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '10 minutes')
);

ALTER TABLE public.tiktok_oauth_states ENABLE ROW LEVEL SECURITY;
-- No client policies — only service role can read/write