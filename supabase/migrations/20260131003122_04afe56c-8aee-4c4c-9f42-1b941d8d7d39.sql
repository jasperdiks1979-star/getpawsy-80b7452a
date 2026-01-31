-- Add referrer and UTM tracking to visitor_activity
ALTER TABLE public.visitor_activity 
ADD COLUMN IF NOT EXISTS referrer text,
ADD COLUMN IF NOT EXISTS utm_source text,
ADD COLUMN IF NOT EXISTS utm_medium text,
ADD COLUMN IF NOT EXISTS utm_campaign text;

-- Create index for faster Pinterest traffic queries
CREATE INDEX IF NOT EXISTS idx_visitor_activity_utm_source ON public.visitor_activity(utm_source);
CREATE INDEX IF NOT EXISTS idx_visitor_activity_referrer ON public.visitor_activity(referrer);