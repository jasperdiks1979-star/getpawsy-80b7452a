CREATE TABLE public.pinterest_niche_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id text NOT NULL UNIQUE,
  niche text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  primary_terms text[] NOT NULL DEFAULT '{}',
  require_any text[] NOT NULL DEFAULT '{}',
  forbid_all text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pinterest_niche_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view niche rules"
ON public.pinterest_niche_rules FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert niche rules"
ON public.pinterest_niche_rules FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update niche rules"
ON public.pinterest_niche_rules FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete niche rules"
ON public.pinterest_niche_rules FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_pinterest_niche_rules_updated
BEFORE UPDATE ON public.pinterest_niche_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_pinterest_niche_rules_priority ON public.pinterest_niche_rules (priority, rule_id);