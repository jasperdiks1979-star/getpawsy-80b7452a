
-- FIX 1: referral_codes — hide owner_email/owner_name from public
DROP POLICY IF EXISTS "Anyone can read active referral codes" ON public.referral_codes;
DROP POLICY IF EXISTS "Service role manages referral codes" ON public.referral_codes;

CREATE OR REPLACE VIEW public.referral_codes_public
WITH (security_invoker = on) AS
  SELECT id, code, reward_type, reward_value, is_active
  FROM public.referral_codes
  WHERE is_active = true;

CREATE POLICY "Service role full access on referral_codes"
  ON public.referral_codes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admins can read referral_codes"
  ON public.referral_codes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can read active referral codes safely"
  ON public.referral_codes FOR SELECT TO anon
  USING (is_active = true);

-- FIX 2: strategy_evolution_log — restrict to service_role + admin only
DROP POLICY IF EXISTS "Service write strategy_evolution_log" ON public.strategy_evolution_log;

CREATE POLICY "Service role full access on strategy_evolution_log"
  ON public.strategy_evolution_log FOR ALL TO service_role USING (true) WITH CHECK (true);
