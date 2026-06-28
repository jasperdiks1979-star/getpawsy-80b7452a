ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS pcie2_creative_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_pinterest_pin_queue_pcie2_creative
  ON public.pinterest_pin_queue(pcie2_creative_id)
  WHERE pcie2_creative_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pcie2_creatives_pinterest_pin_id
  ON public.pcie2_creatives(pinterest_pin_id)
  WHERE pinterest_pin_id IS NOT NULL;