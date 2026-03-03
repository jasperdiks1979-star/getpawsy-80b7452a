CREATE TABLE public.cj_us_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cj_product_id text NOT NULL,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  shipping_time integer,
  warehouse text NOT NULL DEFAULT 'US',
  category text,
  score integer NOT NULL DEFAULT 0,
  image_url text,
  image_ok boolean DEFAULT true,
  weight numeric,
  stock integer,
  auto_imported boolean DEFAULT false,
  imported_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cj_product_id)
);

ALTER TABLE public.cj_us_winners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read cj_us_winners" ON public.cj_us_winners
  FOR SELECT USING (true);

CREATE POLICY "Service role manage cj_us_winners" ON public.cj_us_winners
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_cj_us_winners_updated_at
  BEFORE UPDATE ON public.cj_us_winners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();