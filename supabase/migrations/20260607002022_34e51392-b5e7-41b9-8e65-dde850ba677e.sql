-- Revenue funnel emergency fix: stop sending traffic to OOS products.
-- Audit 2026-06-07: 5 of 11 active homepage bestsellers and 84 of 152
-- recent Pinterest pins had stock=0. OOS PDPs block the Add-To-Cart
-- button, producing 0 carts and 0 sales over the last 72h.

-- 1. Hide OOS products from the homepage bestsellers carousel.
UPDATE public.bestsellers b
SET is_active = false
FROM public.products p
WHERE b.product_id = p.id
  AND b.is_active = true
  AND p.stock = 0;

-- 2. Skip queued Pinterest pins for OOS products.
UPDATE public.pinterest_pin_queue q
SET status = 'skipped',
    last_publish_error = CASE
      WHEN q.last_publish_error IS NULL OR q.last_publish_error = ''
        THEN 'oos_guard: product stock=0 at 2026-06-07 audit'
      ELSE q.last_publish_error || ' | oos_guard: product stock=0 at 2026-06-07 audit'
    END
FROM public.products p
WHERE q.product_id = p.id
  AND q.status IN ('queued','scheduled','ready','pending','draft')
  AND p.stock = 0;