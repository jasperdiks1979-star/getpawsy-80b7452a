
-- Pinterest pin performance tracking
CREATE TABLE public.pinterest_pin_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_url TEXT,
  pin_title TEXT,
  pin_description TEXT,
  hook_angle TEXT,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  ctr NUMERIC(5,4) DEFAULT 0,
  performance_score NUMERIC(5,2) DEFAULT 0,
  status TEXT DEFAULT 'active',
  generation_batch TEXT DEFAULT 'original',
  parent_pin_id UUID,
  keywords TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Publishing queue for daily automation
CREATE TABLE public.pinterest_publish_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL,
  pin_title TEXT NOT NULL,
  pin_description TEXT NOT NULL,
  image_prompt TEXT,
  hashtags TEXT,
  product_url TEXT NOT NULL,
  hook_angle TEXT,
  overlay_text TEXT,
  posting_slot TEXT DEFAULT 'morning',
  status TEXT DEFAULT 'queued',
  scheduled_for TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  pin_id_external TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Keyword performance tracking
CREATE TABLE public.pinterest_keyword_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  total_impressions INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_saves INTEGER DEFAULT 0,
  avg_ctr NUMERIC(5,4) DEFAULT 0,
  pin_count INTEGER DEFAULT 0,
  long_tail_variants JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(keyword)
);

-- Enable RLS
ALTER TABLE public.pinterest_pin_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinterest_publish_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinterest_keyword_performance ENABLE ROW LEVEL SECURITY;

-- Admin policies
CREATE POLICY "Admin full access pin_performance" ON public.pinterest_pin_performance FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin full access publish_queue" ON public.pinterest_publish_queue FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin full access keyword_performance" ON public.pinterest_keyword_performance FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger
CREATE TRIGGER update_pin_performance_updated_at BEFORE UPDATE ON public.pinterest_pin_performance FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_keyword_performance_updated_at BEFORE UPDATE ON public.pinterest_keyword_performance FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
