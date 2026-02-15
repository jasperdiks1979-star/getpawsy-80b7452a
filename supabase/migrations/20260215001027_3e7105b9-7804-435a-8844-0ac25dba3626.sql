
-- =============================================
-- 1. Review requests tracking
-- =============================================
CREATE TABLE public.review_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id),
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  product_ids TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, completed, skipped
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  reminder_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_id)
);

ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on review_requests"
  ON public.review_requests FOR ALL
  USING (true) WITH CHECK (true);

-- =============================================
-- 2. Replenishment reminders
-- =============================================
CREATE TABLE public.replenishment_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id),
  customer_email TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_slug TEXT,
  product_image TEXT,
  estimated_reorder_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, reordered, dismissed
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.replenishment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on replenishment_reminders"
  ON public.replenishment_reminders FOR ALL
  USING (true) WITH CHECK (true);

-- =============================================
-- 3. Referral program
-- =============================================
CREATE TABLE public.referral_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  owner_email TEXT NOT NULL,
  owner_name TEXT,
  reward_type TEXT NOT NULL DEFAULT 'percentage', -- percentage, fixed
  reward_value NUMERIC NOT NULL DEFAULT 10, -- 10% off for referred
  owner_reward_value NUMERIC NOT NULL DEFAULT 10, -- $10 credit for referrer
  uses_count INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER DEFAULT 50,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active referral codes"
  ON public.referral_codes FOR SELECT
  USING (is_active = true);

CREATE POLICY "Service role manages referral codes"
  ON public.referral_codes FOR ALL
  USING (true) WITH CHECK (true);

CREATE TABLE public.referral_uses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referral_code_id UUID NOT NULL REFERENCES public.referral_codes(id),
  referred_email TEXT NOT NULL,
  referred_order_id UUID REFERENCES public.orders(id),
  reward_credited BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on referral_uses"
  ON public.referral_uses FOR ALL
  USING (true) WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_review_requests_updated_at
  BEFORE UPDATE ON public.review_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_replenishment_reminders_updated_at
  BEFORE UPDATE ON public.replenishment_reminders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_referral_codes_updated_at
  BEFORE UPDATE ON public.referral_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
