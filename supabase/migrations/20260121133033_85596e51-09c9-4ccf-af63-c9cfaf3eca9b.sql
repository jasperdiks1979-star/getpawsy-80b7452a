-- Create email_campaign_events table to track opens and clicks
CREATE TABLE public.email_campaign_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('open', 'click')),
  link_url TEXT,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for faster queries
CREATE INDEX idx_campaign_events_campaign_id ON public.email_campaign_events(campaign_id);
CREATE INDEX idx_campaign_events_event_type ON public.email_campaign_events(event_type);

-- Add open and click counts to campaigns table
ALTER TABLE public.email_campaigns 
ADD COLUMN open_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN click_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN unique_opens INTEGER NOT NULL DEFAULT 0,
ADD COLUMN unique_clicks INTEGER NOT NULL DEFAULT 0;

-- Enable RLS
ALTER TABLE public.email_campaign_events ENABLE ROW LEVEL SECURITY;

-- Only admins can view events
CREATE POLICY "Admins can view campaign events" 
ON public.email_campaign_events 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert events (for tracking)
CREATE POLICY "Service role can insert events" 
ON public.email_campaign_events 
FOR INSERT 
WITH CHECK (auth.role() = 'service_role');

-- Allow anonymous inserts for tracking (needed for tracking pixel)
CREATE POLICY "Anyone can insert tracking events" 
ON public.email_campaign_events 
FOR INSERT 
WITH CHECK (true);