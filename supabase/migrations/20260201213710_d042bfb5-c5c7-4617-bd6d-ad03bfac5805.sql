-- Create SEO nurture queue table to track email flow progress
CREATE TABLE public.seo_nurture_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  signup_source TEXT DEFAULT 'blog' CHECK (signup_source IN ('blog', 'collection', 'footer', 'popup', 'other')),
  subscribed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Email tracking
  welcome_sent BOOLEAN NOT NULL DEFAULT false,
  welcome_sent_at TIMESTAMP WITH TIME ZONE,
  education_sent BOOLEAN NOT NULL DEFAULT false,
  education_sent_at TIMESTAMP WITH TIME ZONE,
  conversion_sent BOOLEAN NOT NULL DEFAULT false,
  conversion_sent_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_nurture_email UNIQUE (email)
);

-- Enable RLS
ALTER TABLE public.seo_nurture_queue ENABLE ROW LEVEL SECURITY;

-- Service role can manage everything
CREATE POLICY "Service role can manage nurture queue"
  ON public.seo_nurture_queue
  FOR ALL
  USING (auth.role() = 'service_role');

-- Admins can view
CREATE POLICY "Admins can view nurture queue"
  ON public.seo_nurture_queue
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for efficient queue processing
CREATE INDEX idx_nurture_queue_pending_education 
  ON public.seo_nurture_queue (subscribed_at) 
  WHERE education_sent = false AND welcome_sent = true;

CREATE INDEX idx_nurture_queue_pending_conversion 
  ON public.seo_nurture_queue (subscribed_at) 
  WHERE conversion_sent = false AND education_sent = true;

-- Add trigger for updated_at
CREATE TRIGGER update_seo_nurture_queue_updated_at
  BEFORE UPDATE ON public.seo_nurture_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();