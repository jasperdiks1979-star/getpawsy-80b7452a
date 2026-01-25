-- Create packaging inventory table
CREATE TABLE public.packaging_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL UNIQUE,
  item_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  reorder_threshold integer NOT NULL DEFAULT 100,
  unit_cost numeric(10,4) DEFAULT 0,
  last_restocked_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.packaging_inventory ENABLE ROW LEVEL SECURITY;

-- Admins can manage inventory
CREATE POLICY "Admins can view inventory"
  ON public.packaging_inventory FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert inventory"
  ON public.packaging_inventory FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update inventory"
  ON public.packaging_inventory FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete inventory"
  ON public.packaging_inventory FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_packaging_inventory_updated_at
  BEFORE UPDATE ON public.packaging_inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default inventory items
INSERT INTO public.packaging_inventory (item_type, item_name, quantity, reorder_threshold, unit_cost) VALUES
  ('logo_sticker', 'Logo Sticker (5cm rond)', 500, 100, 0.015),
  ('thank_you_card', 'Bedankkaart (8.5x5.5cm)', 500, 100, 0.05),
  ('poly_mailer_small', 'Poly Mailer Small (20x30cm)', 200, 50, 0.08),
  ('poly_mailer_medium', 'Poly Mailer Medium (30x40cm)', 200, 50, 0.12);

-- Create inventory log table for tracking changes
CREATE TABLE public.packaging_inventory_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid REFERENCES public.packaging_inventory(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  change_amount integer NOT NULL,
  change_type text NOT NULL, -- 'order_deduction', 'manual_adjustment', 'restock'
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on logs
ALTER TABLE public.packaging_inventory_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view inventory logs"
  ON public.packaging_inventory_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage inventory logs"
  ON public.packaging_inventory_logs FOR ALL
  USING (auth.role() = 'service_role'::text);