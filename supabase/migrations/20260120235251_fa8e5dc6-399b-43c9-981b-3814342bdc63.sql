-- Add CJ order tracking columns to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS cj_order_id TEXT,
ADD COLUMN IF NOT EXISTS cj_order_status TEXT,
ADD COLUMN IF NOT EXISTS cj_shipping_info JSONB,
ADD COLUMN IF NOT EXISTS cj_order_created_at TIMESTAMP WITH TIME ZONE;

-- Create index for CJ order lookups
CREATE INDEX IF NOT EXISTS idx_orders_cj_order_id ON public.orders(cj_order_id);

-- Add comment for documentation
COMMENT ON COLUMN public.orders.cj_order_id IS 'CJ Dropshipping order ID after order is placed';
COMMENT ON COLUMN public.orders.cj_order_status IS 'Status from CJ Dropshipping (e.g., pending, shipped)';
COMMENT ON COLUMN public.orders.cj_shipping_info IS 'Shipping/tracking info from CJ';