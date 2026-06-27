ALTER TABLE public.analytics_funnel_waterfall
  ADD COLUMN IF NOT EXISTS view_cart_at timestamptz,
  ADD COLUMN IF NOT EXISTS remove_from_cart_at timestamptz;