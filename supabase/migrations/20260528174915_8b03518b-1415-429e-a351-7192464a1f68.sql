
-- Extend sessions with device-classification columns (additive, nullable)
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS browser_family TEXT,
  ADD COLUMN IF NOT EXISTS os_family TEXT,
  ADD COLUMN IF NOT EXISTS in_app_browser TEXT,
  ADD COLUMN IF NOT EXISTS device_confidence INTEGER;

CREATE INDEX IF NOT EXISTS sessions_in_app_browser_idx
  ON public.sessions (in_app_browser, started_at DESC)
  WHERE in_app_browser IS NOT NULL;

-- Hero / priority tiering for products
CREATE TABLE IF NOT EXISTS public.product_priority (
  product_id TEXT PRIMARY KEY,
  tier TEXT NOT NULL CHECK (tier IN ('hero','testing','low_priority','seasonal','clearance')),
  notes TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_priority TO authenticated;
GRANT ALL ON public.product_priority TO service_role;

ALTER TABLE public.product_priority ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read product priority"
  ON public.product_priority FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins write product priority"
  ON public.product_priority FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update product priority"
  ON public.product_priority FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete product priority"
  ON public.product_priority FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS product_priority_tier_idx
  ON public.product_priority (tier);

-- Timestamp trigger reuses existing helper
DROP TRIGGER IF EXISTS update_product_priority_updated_at ON public.product_priority;
CREATE TRIGGER update_product_priority_updated_at
  BEFORE UPDATE ON public.product_priority
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
