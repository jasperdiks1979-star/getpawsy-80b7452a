CREATE TABLE public.shopping_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  optimized_title text NOT NULL DEFAULT '',
  optimized_description text NOT NULL DEFAULT '',
  google_category text,
  google_category_id integer,
  product_type text,
  keyword_suggestions text[] DEFAULT '{}',
  image_ok boolean DEFAULT true,
  image_issue text,
  priority_feed boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id)
);

ALTER TABLE public.shopping_winners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read shopping_winners" ON public.shopping_winners
  FOR SELECT USING (true);

CREATE POLICY "Service role manage shopping_winners" ON public.shopping_winners
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_shopping_winners_updated_at
  BEFORE UPDATE ON public.shopping_winners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();