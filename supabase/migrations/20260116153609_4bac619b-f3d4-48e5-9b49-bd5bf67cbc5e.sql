-- Create table for saved Google Ads
CREATE TABLE public.saved_google_ads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  target_audience TEXT,
  language TEXT NOT NULL DEFAULT 'nl',
  headlines TEXT[] NOT NULL,
  descriptions TEXT[] NOT NULL,
  display_paths TEXT[] NOT NULL,
  keywords TEXT[] NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_google_ads ENABLE ROW LEVEL SECURITY;

-- Only admins can manage saved ads
CREATE POLICY "Admins can view saved ads"
ON public.saved_google_ads
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert saved ads"
ON public.saved_google_ads
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update saved ads"
ON public.saved_google_ads
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete saved ads"
ON public.saved_google_ads
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_saved_google_ads_updated_at
BEFORE UPDATE ON public.saved_google_ads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();