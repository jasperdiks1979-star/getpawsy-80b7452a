-- Rollback the bulk import of 2026-04-19: remove the 105 newly imported products
-- that did not match the pet-niche correctly (e.g., transformer car toys, fashion pants)
DELETE FROM public.products
WHERE created_at >= '2026-04-19'::date
  AND created_at < '2026-04-20'::date;