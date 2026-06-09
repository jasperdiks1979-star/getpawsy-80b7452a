CREATE TABLE IF NOT EXISTS public.pinterest_catalog_status (
  id INTEGER PRIMARY KEY DEFAULT 1,
  feed_id TEXT,
  feed_url TEXT,
  feed_status TEXT,
  processing_status TEXT,
  items_total INTEGER,
  items_invalid INTEGER,
  last_error TEXT,
  accepted_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pinterest_catalog_status_singleton CHECK (id = 1)
);

GRANT SELECT ON public.pinterest_catalog_status TO authenticated;
GRANT ALL ON public.pinterest_catalog_status TO service_role;

ALTER TABLE public.pinterest_catalog_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read catalog status"
  ON public.pinterest_catalog_status
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service writes catalog status"
  ON public.pinterest_catalog_status
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER set_pinterest_catalog_status_updated_at
  BEFORE UPDATE ON public.pinterest_catalog_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.pinterest_catalog_status (id) VALUES (1) ON CONFLICT (id) DO NOTHING;