-- Add cj_product_id column to packaging_inventory table
ALTER TABLE public.packaging_inventory 
ADD COLUMN cj_product_id text DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.packaging_inventory.cj_product_id IS 'CJ Dropshipping product ID for automatic inventory sync';