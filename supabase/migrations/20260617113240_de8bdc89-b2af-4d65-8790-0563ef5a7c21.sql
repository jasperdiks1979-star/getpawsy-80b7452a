
ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS legacy_supplier_content boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legacy_supplier_reason text;

ALTER TABLE public.pinterest_pins
  ADD COLUMN IF NOT EXISTS legacy_supplier_content boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legacy_supplier_reason text;

CREATE INDEX IF NOT EXISTS pinterest_pin_queue_legacy_supplier_idx
  ON public.pinterest_pin_queue (legacy_supplier_content)
  WHERE legacy_supplier_content = true;
