-- Create table to store passkey credentials
CREATE TABLE public.passkey_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;

-- Users can view their own passkeys
CREATE POLICY "Users can view their own passkeys"
ON public.passkey_credentials
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own passkeys
CREATE POLICY "Users can insert their own passkeys"
ON public.passkey_credentials
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own passkeys
CREATE POLICY "Users can delete their own passkeys"
ON public.passkey_credentials
FOR DELETE
USING (auth.uid() = user_id);

-- Service role can update counter (for authentication)
CREATE POLICY "Service role can update passkeys"
ON public.passkey_credentials
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_passkey_credentials_credential_id ON public.passkey_credentials(credential_id);
CREATE INDEX idx_passkey_credentials_user_id ON public.passkey_credentials(user_id);