CREATE TABLE IF NOT EXISTS public.pinterest_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  product_slug text NOT NULL,
  product_name text NOT NULL,
  product_url text NOT NULL,
  pin_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id)
);

ALTER TABLE public.pinterest_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pinterest pins"
  ON public.pinterest_pins
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can read pinterest pins"
  ON public.pinterest_pins
  FOR SELECT
  TO anon
  USING (true);