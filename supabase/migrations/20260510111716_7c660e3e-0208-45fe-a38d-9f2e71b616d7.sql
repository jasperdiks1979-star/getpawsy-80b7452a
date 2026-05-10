ALTER TABLE public.pinterest_creative_intents
  ADD COLUMN IF NOT EXISTS pin_mode TEXT;

ALTER TABLE public.pinterest_landing_templates
  ADD COLUMN IF NOT EXISTS pin_mode TEXT,
  ADD COLUMN IF NOT EXISTS aesthetic_tone TEXT;

ALTER TABLE public.pinterest_render_attempts
  ADD COLUMN IF NOT EXISTS pin_mode TEXT;

CREATE INDEX IF NOT EXISTS idx_pci_pin_mode
  ON public.pinterest_creative_intents (pin_mode);

CREATE INDEX IF NOT EXISTS idx_plt_pin_mode
  ON public.pinterest_landing_templates (pin_mode);
