
-- Authority Engine: Content Clusters
CREATE TABLE public.authority_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  niche text NOT NULL,
  cornerstone_slug text NOT NULL,
  cornerstone_title text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed')),
  topical_map jsonb DEFAULT '[]'::jsonb,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Authority Engine: Individual Articles
CREATE TABLE public.cluster_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES public.authority_clusters(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text,
  seo_title text,
  meta_description text,
  primary_keyword text,
  secondary_keywords text[] DEFAULT '{}',
  search_intent text DEFAULT 'informational' CHECK (search_intent IN ('informational','commercial','transactional','navigational')),
  article_role text DEFAULT 'support' CHECK (article_role IN ('cornerstone','support','micro')),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','brief','draft','review','published','archived')),
  outline jsonb,
  content text,
  faq jsonb DEFAULT '[]'::jsonb,
  key_takeaways text[] DEFAULT '{}',
  internal_links jsonb DEFAULT '[]'::jsonb,
  word_count integer DEFAULT 0,
  canonical_url text,
  publish_date timestamptz,
  approved boolean DEFAULT false,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cluster_id, slug)
);

-- Authority Engine: Publishing Queue
CREATE TABLE public.cluster_publish_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.cluster_articles(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  published boolean DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_cluster_articles_cluster ON public.cluster_articles(cluster_id);
CREATE INDEX idx_cluster_articles_status ON public.cluster_articles(status);
CREATE INDEX idx_cluster_articles_slug ON public.cluster_articles(slug);
CREATE INDEX idx_publish_queue_date ON public.cluster_publish_queue(scheduled_date);

-- RLS
ALTER TABLE public.authority_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cluster_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cluster_publish_queue ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admin select authority_clusters" ON public.authority_clusters
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert authority_clusters" ON public.authority_clusters
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update authority_clusters" ON public.authority_clusters
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete authority_clusters" ON public.authority_clusters
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin select cluster_articles" ON public.cluster_articles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert cluster_articles" ON public.cluster_articles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update cluster_articles" ON public.cluster_articles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete cluster_articles" ON public.cluster_articles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin select cluster_publish_queue" ON public.cluster_publish_queue
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin insert cluster_publish_queue" ON public.cluster_publish_queue
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update cluster_publish_queue" ON public.cluster_publish_queue
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete cluster_publish_queue" ON public.cluster_publish_queue
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Updated_at triggers
CREATE TRIGGER update_authority_clusters_updated_at
  BEFORE UPDATE ON public.authority_clusters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cluster_articles_updated_at
  BEFORE UPDATE ON public.cluster_articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
