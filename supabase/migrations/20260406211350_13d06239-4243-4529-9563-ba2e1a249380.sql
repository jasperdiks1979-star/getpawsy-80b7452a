
-- Add Pinterest fields to products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS pinterest_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinterest_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinterest_priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS pinterest_category text,
  ADD COLUMN IF NOT EXISTS pinterest_last_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinterest_last_posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinterest_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS pinterest_error text,
  ADD COLUMN IF NOT EXISTS pinterest_board_override text;

-- Board mapping configuration
CREATE TABLE IF NOT EXISTS public.pinterest_board_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key text NOT NULL UNIQUE,
  board_names text[] NOT NULL DEFAULT '{}',
  priority int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pinterest_board_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view board mappings"
  ON public.pinterest_board_mappings FOR SELECT USING (true);

CREATE POLICY "Admins can manage board mappings"
  ON public.pinterest_board_mappings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default board mappings
INSERT INTO public.pinterest_board_mappings (category_key, board_names, priority) VALUES
  ('cat_trees', ARRAY['Cat Trees for Large Cats','Best Cat Trees 2026','Cat Furniture','Cat Tree Buying Guide','Indoor Cat Setup'], 1),
  ('cat_litter_boxes', ARRAY['Smart Self-Cleaning Cat Litter Box','Cat Essentials','Cat Products','Indoor Cat Setup'], 2),
  ('cat_furniture', ARRAY['Cat Furniture','Indoor Cat Setup','Modern Cat Furniture'], 3),
  ('cat_essentials', ARRAY['Cat Essentials','Cat Products'], 4),
  ('dog_travel', ARRAY['Dog Travel Accessories'], 5),
  ('fallback', ARRAY['Cat Products','Pet Products'], 99)
ON CONFLICT (category_key) DO NOTHING;

-- Pinterest connection state (singleton-ish)
CREATE TABLE IF NOT EXISTS public.pinterest_connection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text,
  account_id text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'disconnected',
  last_publish_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pinterest_connection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pinterest connection"
  ON public.pinterest_connection FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add status column to pinterest_pin_queue if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pinterest_pin_queue' AND column_name = 'hook_group') THEN
    ALTER TABLE public.pinterest_pin_queue ADD COLUMN hook_group text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pinterest_pin_queue' AND column_name = 'category_key') THEN
    ALTER TABLE public.pinterest_pin_queue ADD COLUMN category_key text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pinterest_pin_queue' AND column_name = 'pin_external_id') THEN
    ALTER TABLE public.pinterest_pin_queue ADD COLUMN pin_external_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pinterest_pin_queue' AND column_name = 'overlay_text') THEN
    ALTER TABLE public.pinterest_pin_queue ADD COLUMN overlay_text text;
  END IF;
END $$;

-- Trigger for updated_at on board mappings
CREATE TRIGGER update_pinterest_board_mappings_updated_at
  BEFORE UPDATE ON public.pinterest_board_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pinterest_connection_updated_at
  BEFORE UPDATE ON public.pinterest_connection
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
