
-- Table to persist SEO feature flags per admin user
CREATE TABLE public.seo_feature_flags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hyper_aggressive BOOLEAN NOT NULL DEFAULT false,
  dominance_mode BOOLEAN NOT NULL DEFAULT false,
  content_dominance BOOLEAN NOT NULL DEFAULT false,
  growth_domination BOOLEAN NOT NULL DEFAULT false,
  enterprise_expansion BOOLEAN NOT NULL DEFAULT false,
  algorithm_immunity BOOLEAN NOT NULL DEFAULT false,
  intelligence_stack BOOLEAN NOT NULL DEFAULT false,
  autonomous_growth_loop BOOLEAN NOT NULL DEFAULT false,
  revenue_market_capture BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.seo_feature_flags ENABLE ROW LEVEL SECURITY;

-- Admins can read their own flags
CREATE POLICY "Users can read own seo flags"
ON public.seo_feature_flags
FOR SELECT
TO authenticated
USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

-- Admins can insert their own flags
CREATE POLICY "Users can insert own seo flags"
ON public.seo_feature_flags
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

-- Admins can update their own flags
CREATE POLICY "Users can update own seo flags"
ON public.seo_feature_flags
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

-- Auto-update timestamp
CREATE TRIGGER update_seo_feature_flags_updated_at
BEFORE UPDATE ON public.seo_feature_flags
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
