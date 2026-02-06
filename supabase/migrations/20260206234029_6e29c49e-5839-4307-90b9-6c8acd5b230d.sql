-- Add last_stock_sync_at to track when supplier stock was last synced
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS last_stock_sync_at TIMESTAMP WITH TIME ZONE;

-- Add comment for clarity
COMMENT ON COLUMN public.products.last_stock_sync_at IS 'Timestamp of last successful supplier stock sync for this product';