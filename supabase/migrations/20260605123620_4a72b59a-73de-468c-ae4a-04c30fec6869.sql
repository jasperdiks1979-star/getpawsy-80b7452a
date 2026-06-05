CREATE TABLE IF NOT EXISTS public.dynamic_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  product_ids uuid[] NOT NULL DEFAULT '{}',
  product_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dynamic_collections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dynamic_collections TO authenticated;
GRANT ALL ON public.dynamic_collections TO service_role;

ALTER TABLE public.dynamic_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active dynamic collections"
  ON public.dynamic_collections FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins manage dynamic collections"
  ON public.dynamic_collections FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_dynamic_collections_updated_at
BEFORE UPDATE ON public.dynamic_collections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();