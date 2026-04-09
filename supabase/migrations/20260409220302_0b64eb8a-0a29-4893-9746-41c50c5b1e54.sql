
-- Add media columns to tiktok_post_queue
ALTER TABLE public.tiktok_post_queue
  ADD COLUMN IF NOT EXISTS media_urls text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS video_url text;

-- Create storage bucket for TikTok media
INSERT INTO storage.buckets (id, name, public)
VALUES ('tiktok-media', 'tiktok-media', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access for tiktok-media bucket
CREATE POLICY "Public read access for tiktok media"
ON storage.objects FOR SELECT
USING (bucket_id = 'tiktok-media');

-- Admin upload access
CREATE POLICY "Admin upload tiktok media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'tiktok-media' AND public.has_role(auth.uid(), 'admin'));

-- Admin delete tiktok media
CREATE POLICY "Admin delete tiktok media"
ON storage.objects FOR DELETE
USING (bucket_id = 'tiktok-media' AND public.has_role(auth.uid(), 'admin'));
