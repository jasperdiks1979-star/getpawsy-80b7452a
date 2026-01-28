-- Create table for sourcing opportunities (trending products we don't sell yet)
CREATE TABLE public.sourcing_opportunities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_product_id UUID REFERENCES public.competitor_products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  competitor TEXT NOT NULL,
  current_rank INTEGER NOT NULL,
  price NUMERIC,
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'new', -- new, reviewed, sourced, dismissed
  notes TEXT,
  cj_product_id TEXT, -- if found in CJ
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(competitor_product_id)
);

-- Enable RLS
ALTER TABLE public.sourcing_opportunities ENABLE ROW LEVEL SECURITY;

-- Admin can view and manage sourcing opportunities
CREATE POLICY "Admins can view sourcing opportunities"
  ON public.sourcing_opportunities
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update sourcing opportunities"
  ON public.sourcing_opportunities
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage sourcing opportunities"
  ON public.sourcing_opportunities
  FOR ALL
  USING (auth.role() = 'service_role');

-- Add index for efficient lookups
CREATE INDEX idx_sourcing_opportunities_status ON public.sourcing_opportunities(status);
CREATE INDEX idx_sourcing_opportunities_competitor ON public.sourcing_opportunities(competitor);

-- Add trigger for updated_at
CREATE TRIGGER update_sourcing_opportunities_updated_at
  BEFORE UPDATE ON public.sourcing_opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();