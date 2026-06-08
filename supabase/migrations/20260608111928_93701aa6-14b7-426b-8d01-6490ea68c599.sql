
CREATE OR REPLACE VIEW public.product_stock_audit
WITH (security_invoker = true) AS
SELECT
  (SELECT COUNT(*) FROM public.products) AS total_products,
  (SELECT COUNT(*) FROM public.products WHERE is_active = true) AS active_products,
  (SELECT COUNT(*) FROM public.products
     WHERE is_active = true
       AND (stock IS NULL OR stock > 0)
       AND (availability IS NULL OR availability = 'in stock')) AS in_stock_products,
  (SELECT COUNT(*) FROM public.products
     WHERE is_active = true
       AND (stock = 0 OR availability = 'out of stock')) AS out_of_stock_products,
  (SELECT COUNT(*) FROM public.products p
     JOIN public.products_public sp ON sp.id = p.id
     WHERE p.stock = 0 OR p.availability = 'out of stock') AS visible_out_of_stock_products,
  (SELECT COUNT(*) FROM public.products p
     JOIN public.products_public sp ON sp.id = p.id
     WHERE p.stock = 0 OR p.availability = 'out of stock') AS feed_out_of_stock_products,
  (SELECT COUNT(*) FROM public.products p
     JOIN public.products_public sp ON sp.id = p.id
     WHERE p.stock = 0 OR p.availability = 'out of stock') AS atc_enabled_out_of_stock_products,
  NOW() AS computed_at;

GRANT SELECT ON public.product_stock_audit TO authenticated;
GRANT ALL    ON public.product_stock_audit TO service_role;
