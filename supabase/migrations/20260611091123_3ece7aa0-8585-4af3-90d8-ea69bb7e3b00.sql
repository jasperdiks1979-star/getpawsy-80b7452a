
-- ============ Extend pinterest_product_tiers ============
ALTER TABLE public.pinterest_product_tiers
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS block_reason text,
  ADD COLUMN IF NOT EXISTS publish_multiplier integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS hidden_opportunity boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_amplified_at timestamptz;

-- ============ pinterest_growth_runs ============
CREATE TABLE IF NOT EXISTS public.pinterest_growth_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL DEFAULT 'cron',
  dry_run boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  recomputed boolean NOT NULL DEFAULT false,
  winners_amplified integer NOT NULL DEFAULT 0,
  losers_suppressed integer NOT NULL DEFAULT 0,
  opportunities_found integer NOT NULL DEFAULT 0,
  drafts_enqueued integer NOT NULL DEFAULT 0,
  dedupe_skipped integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pinterest_growth_runs TO authenticated;
GRANT ALL ON public.pinterest_growth_runs TO service_role;
ALTER TABLE public.pinterest_growth_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view growth runs"
ON public.pinterest_growth_runs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ============ pinterest_growth_actions ============
CREATE TABLE IF NOT EXISTS public.pinterest_growth_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.pinterest_growth_runs(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  product_id uuid,
  product_slug text,
  pin_id uuid,
  reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pinterest_growth_actions_run_idx
  ON public.pinterest_growth_actions(run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pinterest_growth_actions_product_idx
  ON public.pinterest_growth_actions(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pinterest_growth_actions_type_idx
  ON public.pinterest_growth_actions(action_type, created_at DESC);

GRANT SELECT ON public.pinterest_growth_actions TO authenticated;
GRANT ALL ON public.pinterest_growth_actions TO service_role;
ALTER TABLE public.pinterest_growth_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view growth actions"
ON public.pinterest_growth_actions FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
