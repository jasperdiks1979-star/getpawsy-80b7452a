
-- Table to store auto-generated and published guides
CREATE TABLE public.published_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Pet Care',
  keywords TEXT[] DEFAULT '{}',
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  featured_image TEXT DEFAULT '/images/guides/placeholder.jpg',
  reading_time INTEGER DEFAULT 12,
  related_categories TEXT[] DEFAULT '{}',
  guide_data JSONB NOT NULL DEFAULT '{}',
  cluster TEXT NOT NULL DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT true,
  is_indexed BOOLEAN NOT NULL DEFAULT false,
  indexed_at TIMESTAMPTZ,
  internal_links_count INTEGER DEFAULT 0,
  products_linked INTEGER DEFAULT 0,
  generation_source TEXT DEFAULT 'auto',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Generation log for tracking pipeline runs
CREATE TABLE public.guide_generation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  guides_generated INTEGER DEFAULT 0,
  guides_failed INTEGER DEFAULT 0,
  keywords_processed TEXT[] DEFAULT '{}',
  errors JSONB DEFAULT '[]',
  duration_ms INTEGER,
  triggered_by TEXT DEFAULT 'cron'
);

-- Enable RLS
ALTER TABLE public.published_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guide_generation_log ENABLE ROW LEVEL SECURITY;

-- Public read access for published guides (needed for frontend)
CREATE POLICY "Anyone can read published guides"
  ON public.published_guides FOR SELECT
  USING (is_published = true);

-- Admin write access
CREATE POLICY "Admins can manage published guides"
  ON public.published_guides FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin access for generation log
CREATE POLICY "Admins can read generation log"
  ON public.guide_generation_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service can insert generation log"
  ON public.guide_generation_log FOR INSERT
  WITH CHECK (true);

-- Index for fast slug lookups
CREATE INDEX idx_published_guides_slug ON public.published_guides (slug);
CREATE INDEX idx_published_guides_cluster ON public.published_guides (cluster);
CREATE INDEX idx_published_guides_published ON public.published_guides (is_published);

-- Updated_at trigger
CREATE TRIGGER update_published_guides_updated_at
  BEFORE UPDATE ON public.published_guides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
