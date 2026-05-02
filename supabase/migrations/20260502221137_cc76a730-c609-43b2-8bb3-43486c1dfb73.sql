-- Klarna + payment-method tracking on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS is_klarna boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_method_detected_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_payment_method
  ON public.orders (payment_method)
  WHERE payment_method IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_is_klarna
  ON public.orders (is_klarna)
  WHERE is_klarna = true;

-- Funnel step tracking — granular per-session checkout journey.
CREATE TABLE IF NOT EXISTS public.checkout_funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  stripe_session_id text,
  step text NOT NULL,            -- e.g. 'begin_checkout','klarna_message_shown','klarna_proceed','complete_payment','klarna_purchase'
  value numeric,
  currency text DEFAULT 'usd',
  payment_method text,
  is_klarna boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  source text DEFAULT 'client',  -- 'client' or 'server'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cfe_step ON public.checkout_funnel_events (step);
CREATE INDEX IF NOT EXISTS idx_cfe_session ON public.checkout_funnel_events (session_id);
CREATE INDEX IF NOT EXISTS idx_cfe_stripe_session ON public.checkout_funnel_events (stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_cfe_created_at ON public.checkout_funnel_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cfe_klarna ON public.checkout_funnel_events (is_klarna) WHERE is_klarna = true;

ALTER TABLE public.checkout_funnel_events ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anon) can insert their own funnel event — needed for guest tracking.
CREATE POLICY "anyone can insert funnel events"
  ON public.checkout_funnel_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only admins can read.
CREATE POLICY "admins can read funnel events"
  ON public.checkout_funnel_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Server-side TikTok Events API audit log
CREATE TABLE IF NOT EXISTS public.tiktok_server_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  event_id text,
  pixel_id text,
  payload jsonb,
  response_status int,
  response_body jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tse_event_name ON public.tiktok_server_events (event_name);
CREATE INDEX IF NOT EXISTS idx_tse_created_at ON public.tiktok_server_events (created_at DESC);

ALTER TABLE public.tiktok_server_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can read tiktok server events"
  ON public.tiktok_server_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));