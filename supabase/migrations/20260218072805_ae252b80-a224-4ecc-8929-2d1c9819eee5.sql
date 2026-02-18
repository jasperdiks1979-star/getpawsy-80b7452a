
-- SEO Page Metrics table for GSC data correction layer
CREATE TABLE public.seo_page_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  slug TEXT,
  page_type TEXT NOT NULL DEFAULT 'unknown',
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  avg_position NUMERIC(6,2) NOT NULL DEFAULT 0,
  ctr NUMERIC(6,4) NOT NULL DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(url)
);

-- Index for fast lookups
CREATE INDEX idx_seo_page_metrics_slug ON public.seo_page_metrics(slug);
CREATE INDEX idx_seo_page_metrics_type ON public.seo_page_metrics(page_type);
CREATE INDEX idx_seo_page_metrics_position ON public.seo_page_metrics(avg_position);

-- Enable RLS
ALTER TABLE public.seo_page_metrics ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can manage seo_page_metrics"
  ON public.seo_page_metrics
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin resources table for PDF library
CREATE TABLE public.admin_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage admin_resources"
  ON public.admin_resources
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Storage bucket for admin resources
INSERT INTO storage.buckets (id, name, public) VALUES ('admin-resources', 'admin-resources', false)
ON CONFLICT (id) DO NOTHING;

-- Only admins can manage admin-resources bucket
CREATE POLICY "Admins can upload admin resources"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'admin-resources' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can read admin resources"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'admin-resources' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete admin resources"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'admin-resources' AND public.has_role(auth.uid(), 'admin'));
