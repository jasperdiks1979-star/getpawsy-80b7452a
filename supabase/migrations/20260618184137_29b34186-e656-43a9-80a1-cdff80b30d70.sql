
CREATE TABLE IF NOT EXISTS public.cinematic_v4_storyboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL,
  product_id uuid,
  beats jsonb NOT NULL DEFAULT '[]'::jsonb,
  scene_assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  hook_archetype text,
  status text NOT NULL DEFAULT 'pending',
  cv4_reject_reasons text[] NOT NULL DEFAULT '{}',
  quality_score numeric,
  scene_count int,
  unique_image_count int,
  mp4_url text,
  preview_thumb_url text,
  destination_url text,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_by uuid,
  trace_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cinematic_v4_storyboards TO authenticated;
GRANT ALL ON public.cinematic_v4_storyboards TO service_role;

ALTER TABLE public.cinematic_v4_storyboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cv4 storyboards admin read"
  ON public.cinematic_v4_storyboards FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cv4 storyboards admin write"
  ON public.cinematic_v4_storyboards FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS cv4_storyboards_status_idx ON public.cinematic_v4_storyboards(status);
CREATE INDEX IF NOT EXISTS cv4_storyboards_slug_idx ON public.cinematic_v4_storyboards(product_slug);

CREATE OR REPLACE FUNCTION public.cv4_storyboards_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cv4_storyboards_touch_updated_at_tr ON public.cinematic_v4_storyboards;
CREATE TRIGGER cv4_storyboards_touch_updated_at_tr
  BEFORE UPDATE ON public.cinematic_v4_storyboards
  FOR EACH ROW EXECUTE FUNCTION public.cv4_storyboards_touch_updated_at();

ALTER TABLE public.pinterest_video_queue
  ADD COLUMN IF NOT EXISTS engine_version text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS storyboard_id uuid REFERENCES public.cinematic_v4_storyboards(id),
  ADD COLUMN IF NOT EXISTS scene_count int,
  ADD COLUMN IF NOT EXISTS unique_image_count int,
  ADD COLUMN IF NOT EXISTS quality_score numeric;
