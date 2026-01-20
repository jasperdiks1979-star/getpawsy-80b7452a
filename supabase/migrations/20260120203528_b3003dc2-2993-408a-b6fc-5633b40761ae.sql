-- Fix the passkey_credentials UPDATE policy to be more restrictive
-- Instead of allowing any UPDATE with "true", restrict to service_role only

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service role can update passkeys" ON public.passkey_credentials;

-- Create a more restrictive policy that only allows service_role
CREATE POLICY "Service role can update passkeys"
ON public.passkey_credentials
FOR UPDATE
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');