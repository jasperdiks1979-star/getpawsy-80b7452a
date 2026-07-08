ALTER TABLE public.pinterest_resurrection_candidates
  ADD COLUMN IF NOT EXISTS rendered_image_url text,
  ADD COLUMN IF NOT EXISTS pcie2_queue_id uuid REFERENCES public.pcie2_publish_queue(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ci_passed_at timestamptz,
  ADD COLUMN IF NOT EXISTS bridge_status text,
  ADD COLUMN IF NOT EXISTS bridge_error text;

CREATE INDEX IF NOT EXISTS idx_prc_bridge_status
  ON public.pinterest_resurrection_candidates(bridge_status);

CREATE INDEX IF NOT EXISTS idx_prc_pcie2_queue
  ON public.pinterest_resurrection_candidates(pcie2_queue_id);

COMMENT ON COLUMN public.pinterest_resurrection_candidates.rendered_image_url IS
  'Public URL of image used for pcie2 queue insert. Reused source image for banned_phrase_rewrite; freshly rendered image for image_regen_*/title_rewrite buckets.';
COMMENT ON COLUMN public.pinterest_resurrection_candidates.pcie2_queue_id IS
  'FK to pcie2_publish_queue row created by resurrection-to-pcie2-bridge. NULL until bridged.';
COMMENT ON COLUMN public.pinterest_resurrection_candidates.bridge_status IS
  'One of: bridged, held, failed, dry_run. NULL = not yet processed by bridge.';