
DROP INDEX IF EXISTS public.pinterest_competitor_pins_dedupe_idx;
DELETE FROM public.pinterest_competitor_pins
 WHERE id IN (
   SELECT id FROM (
     SELECT id, row_number() OVER (PARTITION BY COALESCE(product_id::text,''), COALESCE(title_hash,''), COALESCE(source_url,'') ORDER BY created_at) AS rn
     FROM public.pinterest_competitor_pins
   ) t WHERE rn > 1
 );
ALTER TABLE public.pinterest_competitor_pins
  ADD CONSTRAINT pinterest_competitor_pins_dedupe_uniq
  UNIQUE (product_id, title_hash, source_url);
