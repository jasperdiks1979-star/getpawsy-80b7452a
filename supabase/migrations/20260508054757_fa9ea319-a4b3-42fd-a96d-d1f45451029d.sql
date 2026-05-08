ALTER TABLE public.pinterest_runtime_settings
  ADD COLUMN IF NOT EXISTS active_pinterest_connection_id uuid REFERENCES public.pinterest_connection(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pinterest_runtime_settings_active_pinterest_connection
  ON public.pinterest_runtime_settings (active_pinterest_connection_id)
  WHERE active_pinterest_connection_id IS NOT NULL;