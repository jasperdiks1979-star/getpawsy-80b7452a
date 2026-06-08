
-- 1. product_slug_history
CREATE TABLE IF NOT EXISTS public.product_slug_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  old_slug text NOT NULL UNIQUE,
  current_slug text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_slug_history_product ON public.product_slug_history(product_id);
CREATE INDEX IF NOT EXISTS idx_slug_history_current ON public.product_slug_history(current_slug);

GRANT SELECT ON public.product_slug_history TO anon, authenticated;
GRANT ALL ON public.product_slug_history TO service_role;
ALTER TABLE public.product_slug_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "slug_history_public_read" ON public.product_slug_history FOR SELECT USING (true);
CREATE POLICY "slug_history_admin_write" ON public.product_slug_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. product_aliases
CREATE TABLE IF NOT EXISTS public.product_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  alias text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('slug','sku','external_sku','legacy_path')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias, kind)
);
CREATE INDEX IF NOT EXISTS idx_product_aliases_product ON public.product_aliases(product_id);
CREATE INDEX IF NOT EXISTS idx_product_aliases_alias ON public.product_aliases(alias);

GRANT SELECT ON public.product_aliases TO anon, authenticated;
GRANT ALL ON public.product_aliases TO service_role;
ALTER TABLE public.product_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_aliases_public_read" ON public.product_aliases FOR SELECT USING (true);
CREATE POLICY "product_aliases_admin_write" ON public.product_aliases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. pinterest_pin_audit_runs
CREATE TABLE IF NOT EXISTS public.pinterest_pin_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  pins_total int NOT NULL DEFAULT 0,
  pins_valid int NOT NULL DEFAULT 0,
  pins_broken int NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggered_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.pinterest_pin_audit_runs TO authenticated;
GRANT ALL ON public.pinterest_pin_audit_runs TO service_role;
ALTER TABLE public.pinterest_pin_audit_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_runs_admin_only" ON public.pinterest_pin_audit_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. pinterest_pin_audit
CREATE TABLE IF NOT EXISTS public.pinterest_pin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.pinterest_pin_audit_runs(id) ON DELETE SET NULL,
  pin_queue_id uuid REFERENCES public.pinterest_pin_queue(id) ON DELETE CASCADE,
  pinterest_pin_id text,
  destination_url text NOT NULL,
  final_resolved_url text,
  http_status int,
  resolver_step text,
  product_exists boolean NOT NULL DEFAULT false,
  product_active boolean NOT NULL DEFAULT false,
  product_in_stock boolean NOT NULL DEFAULT false,
  duplicate_product boolean NOT NULL DEFAULT false,
  category text,
  repair_strategy text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pin_audit_run ON public.pinterest_pin_audit(run_id);
CREATE INDEX IF NOT EXISTS idx_pin_audit_pin ON public.pinterest_pin_audit(pin_queue_id);
CREATE INDEX IF NOT EXISTS idx_pin_audit_strategy ON public.pinterest_pin_audit(repair_strategy);

GRANT SELECT, INSERT, UPDATE ON public.pinterest_pin_audit TO authenticated;
GRANT ALL ON public.pinterest_pin_audit TO service_role;
ALTER TABLE public.pinterest_pin_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pin_audit_admin_only" ON public.pinterest_pin_audit FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. pinterest_pin_image_match
CREATE TABLE IF NOT EXISTS public.pinterest_pin_image_match (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_queue_id uuid NOT NULL UNIQUE REFERENCES public.pinterest_pin_queue(id) ON DELETE CASCADE,
  score int NOT NULL CHECK (score >= 0 AND score <= 100),
  verdict text NOT NULL CHECK (verdict IN ('exact_match','close_match','partial_match','mismatch')),
  vision_verdict text,
  category_score int,
  title_score int,
  tag_score int,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  scored_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pin_image_match_verdict ON public.pinterest_pin_image_match(verdict, score);

GRANT SELECT, INSERT, UPDATE ON public.pinterest_pin_image_match TO authenticated;
GRANT ALL ON public.pinterest_pin_image_match TO service_role;
ALTER TABLE public.pinterest_pin_image_match ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pin_image_match_admin_only" ON public.pinterest_pin_image_match FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. pinterest_pin_queue — repair tracking columns
ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS repair_strategy text,
  ADD COLUMN IF NOT EXISTS repaired_at timestamptz,
  ADD COLUMN IF NOT EXISTS replacement_for_pin_id uuid REFERENCES public.pinterest_pin_queue(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS image_match_score int;

CREATE INDEX IF NOT EXISTS idx_pin_queue_repair_strategy ON public.pinterest_pin_queue(repair_strategy);
CREATE INDEX IF NOT EXISTS idx_pin_queue_replacement_for ON public.pinterest_pin_queue(replacement_for_pin_id);

-- 7. Trigger: when a product's slug changes, write old slug into history
CREATE OR REPLACE FUNCTION public.record_product_slug_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug AND OLD.slug IS NOT NULL AND NEW.slug IS NOT NULL THEN
    INSERT INTO public.product_slug_history (product_id, old_slug, current_slug, reason)
    VALUES (NEW.id, OLD.slug, NEW.slug, 'auto:slug_changed')
    ON CONFLICT (old_slug) DO UPDATE
      SET current_slug = EXCLUDED.current_slug, created_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_product_slug_change ON public.products;
CREATE TRIGGER trg_record_product_slug_change
AFTER UPDATE OF slug ON public.products
FOR EACH ROW EXECUTE FUNCTION public.record_product_slug_change();
