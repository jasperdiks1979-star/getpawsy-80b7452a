-- Add additional tracking columns for complete funnel tracking
ALTER TABLE public.visitor_activity 
ADD COLUMN IF NOT EXISTS order_id text,
ADD COLUMN IF NOT EXISTS order_value numeric,
ADD COLUMN IF NOT EXISTS product_price numeric,
ADD COLUMN IF NOT EXISTS product_quantity integer,
ADD COLUMN IF NOT EXISTS utm_term text,
ADD COLUMN IF NOT EXISTS utm_content text,
ADD COLUMN IF NOT EXISTS is_internal boolean DEFAULT false;

-- Add index for internal traffic filtering
CREATE INDEX IF NOT EXISTS idx_visitor_activity_is_internal ON public.visitor_activity(is_internal);
CREATE INDEX IF NOT EXISTS idx_visitor_activity_country ON public.visitor_activity(country);

-- Update RLS to allow new activity types
DROP POLICY IF EXISTS "Anyone can insert valid visitor activity" ON public.visitor_activity;
CREATE POLICY "Anyone can insert valid visitor activity" ON public.visitor_activity
FOR INSERT WITH CHECK (
  length(session_id) >= 16 
  AND length(session_id) <= 100
  AND activity_type IN ('browsing', 'cart', 'checkout', 'product_view', 'add_to_cart', 'view_cart', 'purchase')
  AND (page_path IS NULL OR length(page_path) <= 500)
  AND (product_name IS NULL OR length(product_name) <= 500)
  AND (referrer_category IS NULL OR referrer_category IN ('google', 'social', 'direct', 'email', 'paid', 'organic', 'other'))
);