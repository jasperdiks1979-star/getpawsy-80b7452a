-- First Sale Sprint: pause OOS pins blocking the active queue
UPDATE public.pinterest_pin_queue pq
SET status = 'paused',
    rejection_reason = COALESCE(NULLIF(pq.rejection_reason,''), 'product_oos'),
    updated_at = now()
FROM public.products pr
WHERE pr.id = pq.product_id
  AND pq.status IN ('queued','draft')
  AND COALESCE(pr.us_stock, 0) = 0;