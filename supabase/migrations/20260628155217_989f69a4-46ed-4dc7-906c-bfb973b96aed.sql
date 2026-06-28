
-- Enforce email ownership on disputes INSERT
DROP POLICY IF EXISTS "Authenticated users can create valid disputes" ON public.disputes;
CREATE POLICY "Authenticated users can create valid disputes"
ON public.disputes
FOR INSERT
TO authenticated
WITH CHECK (
  customer_email = auth.email()
  AND customer_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND length(customer_email) BETWEEN 5 AND 255
  AND length(description) BETWEEN 10 AND 5000
  AND dispute_type = ANY (ARRAY['damaged','not_received','wrong_item','quality_issue','other'])
);

-- Enforce email matches auth identity on profiles INSERT
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
  AND email = auth.email()
);
