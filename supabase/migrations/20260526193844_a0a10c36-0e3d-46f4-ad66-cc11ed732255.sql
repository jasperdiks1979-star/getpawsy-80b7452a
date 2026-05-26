
-- A/B variant tracking on queue rows
ALTER TABLE public.pinterest_video_queue
  ADD COLUMN IF NOT EXISTS hook_variant text,
  ADD COLUMN IF NOT EXISTS copy_variant text,
  ADD COLUMN IF NOT EXISTS cta_variant text;

-- Quality score on metrics rows (CTR-driven composite)
ALTER TABLE public.pinterest_video_metrics
  ADD COLUMN IF NOT EXISTS pin_quality_score integer;

-- 30-day copy de-duplication history
CREATE TABLE IF NOT EXISTS public.pinterest_video_copy_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  variation_hash text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  hook_variant text,
  copy_variant text,
  cta_variant text,
  cloned_from_asset_id uuid,
  clone_reason text,
  used_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.pinterest_video_copy_history TO authenticated;
GRANT ALL ON public.pinterest_video_copy_history TO service_role;

ALTER TABLE public.pinterest_video_copy_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read copy history"
  ON public.pinterest_video_copy_history FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins insert copy history"
  ON public.pinterest_video_copy_history FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS pinterest_video_copy_history_hash_used_idx
  ON public.pinterest_video_copy_history (variation_hash, used_at DESC);
CREATE INDEX IF NOT EXISTS pinterest_video_copy_history_asset_idx
  ON public.pinterest_video_copy_history (asset_id, used_at DESC);
