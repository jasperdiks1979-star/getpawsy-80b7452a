
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type text,
  ADD COLUMN IF NOT EXISTS google_product_category text,
  ADD COLUMN IF NOT EXISTS custom_label_0 text,
  ADD COLUMN IF NOT EXISTS custom_label_1 text,
  ADD COLUMN IF NOT EXISTS custom_label_2 text,
  ADD COLUMN IF NOT EXISTS custom_label_3 text,
  ADD COLUMN IF NOT EXISTS custom_label_4 text;
