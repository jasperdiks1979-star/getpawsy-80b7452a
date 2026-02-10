
-- FIX 1: Profiles - restrict SELECT to authenticated users only
DROP POLICY IF EXISTS "Users can view own profile, admins can view all" ON public.profiles;
CREATE POLICY "Users can view own profile, admins can view all"
  ON public.profiles FOR SELECT
  TO authenticated
  USING ((auth.uid() = id) OR has_role(auth.uid(), 'admin'::app_role));

-- Also restrict INSERT and UPDATE to authenticated
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- FIX 2: Orders - restrict INSERT to authenticated only (guest checkout uses service_role via edge functions)
DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
CREATE POLICY "Users can create their own orders"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- FIX 3: Disputes - restrict to authenticated users only
DROP POLICY IF EXISTS "Anyone can create valid disputes" ON public.disputes;
CREATE POLICY "Authenticated users can create valid disputes"
  ON public.disputes FOR INSERT
  TO authenticated
  WITH CHECK (
    (customer_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text)
    AND (length(customer_email) >= 5)
    AND (length(customer_email) <= 255)
    AND (length(description) >= 10)
    AND (length(description) <= 5000)
    AND (dispute_type = ANY (ARRAY['damaged','not_received','wrong_item','quality_issue','other']))
  );

-- Restrict dispute SELECT to authenticated only
DROP POLICY IF EXISTS "Customers can view their own disputes" ON public.disputes;
CREATE POLICY "Customers can view their own disputes"
  ON public.disputes FOR SELECT
  TO authenticated
  USING (
    (EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.email = disputes.customer_email
    ))
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (auth.role() = 'service_role'::text)
  );
