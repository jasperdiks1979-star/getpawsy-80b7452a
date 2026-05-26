
-- ============ agm_experiments ============
DROP POLICY IF EXISTS "Service can manage experiments" ON public.agm_experiments;
CREATE POLICY "service_role manage agm_experiments"
  ON public.agm_experiments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============ ctr_model_data ============
DROP POLICY IF EXISTS "Service write ctr_model_data" ON public.ctr_model_data;
CREATE POLICY "service_role write ctr_model_data"
  ON public.ctr_model_data FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============ shopping_winners ============
DROP POLICY IF EXISTS "Service role manage shopping_winners" ON public.shopping_winners;
CREATE POLICY "service_role manage shopping_winners"
  ON public.shopping_winners FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============ cj_us_winners ============
DROP POLICY IF EXISTS "Service role manage cj_us_winners" ON public.cj_us_winners;
CREATE POLICY "service_role manage cj_us_winners"
  ON public.cj_us_winners FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============ dispute_messages ============
DROP POLICY IF EXISTS "Admins can insert dispute messages" ON public.dispute_messages;
CREATE POLICY "Admins can insert dispute messages"
  ON public.dispute_messages FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Customers can insert messages on their dispute"
  ON public.dispute_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_type = 'customer'
    AND EXISTS (
      SELECT 1
      FROM public.disputes d
      JOIN public.profiles p ON p.email = d.customer_email
      WHERE d.id = dispute_messages.dispute_id
        AND p.id = auth.uid()
    )
  );

-- ============ referral_codes ============
DROP POLICY IF EXISTS "Authenticated users can read active referral codes" ON public.referral_codes;
-- Admins keep full read via existing "Admins can read referral_codes" policy.
-- Regular users should validate codes via an edge function (server-side),
-- not by direct SELECT that exposes owner_email.

-- ============ pinterest_attribution_sessions ============
DROP POLICY IF EXISTS "anon update own attribution session" ON public.pinterest_attribution_sessions;
-- Inserts (tracked anonymously) remain allowed via existing insert policy.
-- Updates must now go through an edge function with service_role.

-- ============ seo_collections ============
DROP POLICY IF EXISTS "Admins can manage SEO collections" ON public.seo_collections;
CREATE POLICY "Admins can manage SEO collections"
  ON public.seo_collections FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============ profiles: prevent email self-modification ============
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND email IS NOT DISTINCT FROM (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
  );

-- ============ drop diagnostic leftover ============
DROP TABLE IF EXISTS public._tmp_vault_probe;
