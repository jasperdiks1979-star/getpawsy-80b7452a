
-- Add moderation column to product_reviews
ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;

-- Add reviewer display name (optional, for non-logged-in display)
ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS reviewer_name text;

-- Add is_verified_buyer flag (true if linked to an order)
ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS is_verified_buyer boolean NOT NULL DEFAULT false;

-- Update the SELECT policy to only show approved reviews publicly
DROP POLICY IF EXISTS "Reviews are publicly readable" ON public.product_reviews;
CREATE POLICY "Approved reviews are publicly readable" 
  ON public.product_reviews 
  FOR SELECT 
  USING (is_approved = true OR auth.uid() = user_id);

-- Create index for fast product review lookups
CREATE INDEX IF NOT EXISTS idx_product_reviews_product_approved 
  ON public.product_reviews (product_id, is_approved) 
  WHERE is_approved = true;
