
CREATE TABLE IF NOT EXISTS public.market_gap_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gap_id uuid REFERENCES public.market_opportunity_gaps(id) ON DELETE CASCADE,
  title text NOT NULL,
  rationale text,
  suggested_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_creatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_channels jsonb NOT NULL DEFAULT '["pinterest","tiktok","seo"]'::jsonb,
  priority_score integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  routed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_gap_action_items_status ON public.market_gap_action_items(status, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_gap_action_items_gap ON public.market_gap_action_items(gap_id);

ALTER TABLE public.market_gap_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_gap_action_items"
ON public.market_gap_action_items
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_gap_action_items_updated_at
BEFORE UPDATE ON public.market_gap_action_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
