
ALTER TABLE public.pinterest_attribution_sessions
  ADD COLUMN IF NOT EXISTS click_counted boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS pinterest_pin_performance_pin_id_uniq
  ON public.pinterest_pin_performance(pin_id);

CREATE OR REPLACE FUNCTION public.increment_pinterest_pin_click(
  p_pin_id text,
  p_product_id text,
  p_product_url text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_pin_id IS NULL OR length(p_pin_id) = 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.pinterest_pin_performance (pin_id, product_id, product_url, clicks, impressions, ctr)
  VALUES (p_pin_id, COALESCE(p_product_id, 'unknown'), p_product_url, 1, 0, 0)
  ON CONFLICT (pin_id) DO UPDATE
  SET clicks = pinterest_pin_performance.clicks + 1,
      product_id = COALESCE(NULLIF(EXCLUDED.product_id, 'unknown'), pinterest_pin_performance.product_id),
      product_url = COALESCE(EXCLUDED.product_url, pinterest_pin_performance.product_url),
      ctr = CASE
              WHEN pinterest_pin_performance.impressions > 0
              THEN LEAST(0.9999, (pinterest_pin_performance.clicks + 1)::numeric / pinterest_pin_performance.impressions::numeric)
              ELSE pinterest_pin_performance.ctr
            END,
      updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_pinterest_pin_click(text, text, text) TO service_role;
