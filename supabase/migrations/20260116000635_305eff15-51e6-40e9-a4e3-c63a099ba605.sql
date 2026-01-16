-- Add tracking columns to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS tracking_number TEXT,
ADD COLUMN IF NOT EXISTS tracking_carrier TEXT DEFAULT 'postnl';

-- Add comment for documentation
COMMENT ON COLUMN public.orders.tracking_number IS 'Shipping tracking number from carrier';
COMMENT ON COLUMN public.orders.tracking_carrier IS 'Shipping carrier (postnl, dhl, ups, fedex, dpd)';