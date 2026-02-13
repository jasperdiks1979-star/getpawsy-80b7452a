
-- Internal link injection log table
CREATE TABLE public.internal_link_injections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_slug TEXT NOT NULL,
  target_slug TEXT NOT NULL,
  anchor_text TEXT NOT NULL,
  anchor_type TEXT NOT NULL CHECK (anchor_type IN ('partial', 'semantic', 'branded', 'generic', 'exact')),
  injection_type TEXT NOT NULL CHECK (injection_type IN ('reinforcement', 'cornerstone', 'homepage', 'hub')),
  cluster TEXT,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'approved', 'injected', 'reverted')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  injected_at TIMESTAMP WITH TIME ZONE,
  reverted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.internal_link_injections ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write
CREATE POLICY "Admins can manage link injections"
  ON public.internal_link_injections
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Index for efficient queries
CREATE INDEX idx_link_injections_source ON public.internal_link_injections(source_slug);
CREATE INDEX idx_link_injections_target ON public.internal_link_injections(target_slug);
CREATE INDEX idx_link_injections_status ON public.internal_link_injections(status);
CREATE INDEX idx_link_injections_created ON public.internal_link_injections(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_link_injections_updated_at
  BEFORE UPDATE ON public.internal_link_injections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
