-- Add preferences column to newsletter_subscribers
ALTER TABLE public.newsletter_subscribers
ADD COLUMN preferences jsonb NOT NULL DEFAULT '{
  "product_updates": true,
  "pet_care_tips": true,
  "promotions": true,
  "new_arrivals": true
}'::jsonb;

-- Add preference_token for secure access without login
ALTER TABLE public.newsletter_subscribers
ADD COLUMN preference_token uuid DEFAULT gen_random_uuid();

-- Create index for preference_token lookups
CREATE INDEX idx_newsletter_preference_token ON public.newsletter_subscribers(preference_token);