-- Add enhanced tracking columns to visitor_activity table
ALTER TABLE public.visitor_activity 
ADD COLUMN IF NOT EXISTS page_path text,
ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id),
ADD COLUMN IF NOT EXISTS product_name text,
ADD COLUMN IF NOT EXISTS device_type text,
ADD COLUMN IF NOT EXISTS browser text,
ADD COLUMN IF NOT EXISTS referrer_category text,
ADD COLUMN IF NOT EXISTS screen_width integer,
ADD COLUMN IF NOT EXISTS screen_height integer;

-- Add index for product analytics
CREATE INDEX IF NOT EXISTS idx_visitor_activity_product_id ON public.visitor_activity(product_id);

-- Add index for device analytics
CREATE INDEX IF NOT EXISTS idx_visitor_activity_device_type ON public.visitor_activity(device_type);

-- Add index for page path analytics
CREATE INDEX IF NOT EXISTS idx_visitor_activity_page_path ON public.visitor_activity(page_path);

-- Add index for referrer category analytics
CREATE INDEX IF NOT EXISTS idx_visitor_activity_referrer_category ON public.visitor_activity(referrer_category);

-- Add comment for documentation
COMMENT ON COLUMN public.visitor_activity.device_type IS 'Device type: mobile, tablet, or desktop';
COMMENT ON COLUMN public.visitor_activity.referrer_category IS 'Referrer category: google, social, direct, email, paid, organic, or other';
COMMENT ON COLUMN public.visitor_activity.page_path IS 'The URL path the visitor is on';