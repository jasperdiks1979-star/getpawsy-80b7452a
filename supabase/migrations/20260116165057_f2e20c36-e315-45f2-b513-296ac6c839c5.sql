-- Create table to track visitor activity with location
CREATE TABLE public.visitor_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('browsing', 'cart', 'checkout')),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  country TEXT,
  city TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.visitor_activity ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert their activity (anonymous tracking)
CREATE POLICY "Anyone can insert visitor activity" 
ON public.visitor_activity 
FOR INSERT 
WITH CHECK (true);

-- Only admins can read visitor activity
CREATE POLICY "Admins can read visitor activity" 
ON public.visitor_activity 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Create index for efficient queries
CREATE INDEX idx_visitor_activity_created_at ON public.visitor_activity(created_at DESC);
CREATE INDEX idx_visitor_activity_type ON public.visitor_activity(activity_type);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.visitor_activity;

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_visitor_activity_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_visitor_activity_updated_at
BEFORE UPDATE ON public.visitor_activity
FOR EACH ROW
EXECUTE FUNCTION public.update_visitor_activity_timestamp();

-- Auto-cleanup old entries (older than 24 hours) via scheduled function
CREATE OR REPLACE FUNCTION public.cleanup_old_visitor_activity()
RETURNS void AS $$
BEGIN
  DELETE FROM public.visitor_activity WHERE created_at < now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;