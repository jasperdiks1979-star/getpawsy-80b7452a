-- Phase 7a: Multi-channel expansion

-- Per-channel daily performance signals
CREATE TABLE IF NOT EXISTS public.growth_channel_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('pinterest','tiktok','google_ads')),
  product_id uuid,
  product_slug text,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  spend numeric NOT NULL DEFAULT 0,
  score numeric NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, product_slug, day)
);

CREATE INDEX IF NOT EXISTS idx_gcs_day ON public.growth_channel_signals (day DESC);
CREATE INDEX IF NOT EXISTS idx_gcs_channel_day ON public.growth_channel_signals (channel, day DESC);

ALTER TABLE public.growth_channel_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage channel signals"
ON public.growth_channel_signals
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Channel budget routing
CREATE TABLE IF NOT EXISTS public.growth_channel_budget (
  channel text PRIMARY KEY CHECK (channel IN ('pinterest','tiktok','google_ads')),
  daily_budget numeric NOT NULL DEFAULT 0,
  allocated numeric NOT NULL DEFAULT 0,
  share_pct numeric NOT NULL DEFAULT 0,
  autopilot boolean NOT NULL DEFAULT true,
  last_allocation_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.growth_channel_budget ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage channel budget"
ON public.growth_channel_budget
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed default rows
INSERT INTO public.growth_channel_budget (channel, daily_budget, autopilot)
VALUES
  ('pinterest', 25, true),
  ('tiktok', 0, true),
  ('google_ads', 50, true)
ON CONFLICT (channel) DO NOTHING;

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_growth_channel_budget()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_growth_channel_budget ON public.growth_channel_budget;
CREATE TRIGGER trg_touch_growth_channel_budget
BEFORE UPDATE ON public.growth_channel_budget
FOR EACH ROW EXECUTE FUNCTION public.touch_growth_channel_budget();
