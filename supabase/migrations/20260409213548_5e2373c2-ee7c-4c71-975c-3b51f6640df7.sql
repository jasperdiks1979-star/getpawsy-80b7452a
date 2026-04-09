
CREATE TABLE public.tiktok_post_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_slug TEXT,
  product_name TEXT NOT NULL,
  post_variant TEXT NOT NULL DEFAULT 'hook',
  caption TEXT NOT NULL,
  hashtags TEXT[] DEFAULT '{}',
  video_url TEXT,
  thumbnail_url TEXT,
  destination_link TEXT,
  tracking_params JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  priority TEXT NOT NULL DEFAULT 'medium',
  scheduled_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  tiktok_post_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tiktok_post_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tiktok posts"
  ON public.tiktok_post_queue
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_tiktok_post_queue_updated_at
  BEFORE UPDATE ON public.tiktok_post_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_tiktok_post_queue_status ON public.tiktok_post_queue(status);
CREATE INDEX idx_tiktok_post_queue_scheduled ON public.tiktok_post_queue(scheduled_at);
