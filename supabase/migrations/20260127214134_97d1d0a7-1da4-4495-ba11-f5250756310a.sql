-- Create table for storing scraped content
CREATE TABLE public.scraped_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  content_markdown TEXT,
  content_html TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  scraped_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scraped_content ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can view all scraped content"
ON public.scraped_content
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert scraped content"
ON public.scraped_content
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update scraped content"
ON public.scraped_content
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete scraped content"
ON public.scraped_content
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_scraped_content_updated_at
BEFORE UPDATE ON public.scraped_content
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster URL lookups
CREATE INDEX idx_scraped_content_url ON public.scraped_content(url);
CREATE INDEX idx_scraped_content_created_at ON public.scraped_content(created_at DESC);