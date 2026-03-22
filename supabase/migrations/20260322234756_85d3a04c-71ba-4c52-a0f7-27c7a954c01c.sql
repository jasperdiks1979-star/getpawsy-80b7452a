
CREATE TABLE public.pinterest_pin_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  product_slug text NOT NULL,
  product_name text NOT NULL,
  pin_variant text NOT NULL CHECK (pin_variant IN ('hook', 'problem_solution', 'benefit')),
  pin_title text NOT NULL,
  pin_description text NOT NULL,
  pin_image_url text,
  destination_link text NOT NULL,
  board_name text NOT NULL DEFAULT 'Smart Pet Gadgets',
  hashtags text[] DEFAULT '{}',
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'posted', 'failed', 'skipped')),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pin_queue_status ON public.pinterest_pin_queue(status);
CREATE INDEX idx_pin_queue_scheduled ON public.pinterest_pin_queue(scheduled_at);
CREATE INDEX idx_pin_queue_product_dedup ON public.pinterest_pin_queue(product_id, pin_variant, created_at);

ALTER TABLE public.pinterest_pin_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on pin queue"
  ON public.pinterest_pin_queue FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_pin_queue_updated_at
  BEFORE UPDATE ON public.pinterest_pin_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
