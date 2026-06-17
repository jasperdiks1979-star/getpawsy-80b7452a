CREATE TABLE public.pinterest_scaling_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  total_daily_target integer NOT NULL DEFAULT 30,
  board_analysis jsonb NOT NULL DEFAULT '[]'::jsonb,
  category_gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  hook_fatigue jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  trigger text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pinterest_scaling_runs TO authenticated;
GRANT ALL ON public.pinterest_scaling_runs TO service_role;
ALTER TABLE public.pinterest_scaling_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read scaling runs" ON public.pinterest_scaling_runs
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.pinterest_board_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id text NOT NULL,
  board_name text NOT NULL,
  effective_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  daily_quota integer NOT NULL DEFAULT 1,
  pins_posted_today integer NOT NULL DEFAULT 0,
  smoothed_ctr numeric(6,5) NOT NULL DEFAULT 0,
  impressions_30d integer NOT NULL DEFAULT 0,
  clicks_30d integer NOT NULL DEFAULT 0,
  weight numeric(6,4) NOT NULL DEFAULT 0,
  reason text,
  run_id uuid REFERENCES public.pinterest_scaling_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(board_id, effective_date)
);

CREATE INDEX idx_board_quotas_date ON public.pinterest_board_quotas(effective_date DESC);
CREATE INDEX idx_board_quotas_board ON public.pinterest_board_quotas(board_id);

GRANT SELECT ON public.pinterest_board_quotas TO authenticated;
GRANT ALL ON public.pinterest_board_quotas TO service_role;
ALTER TABLE public.pinterest_board_quotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read board quotas" ON public.pinterest_board_quotas
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_board_quotas_updated
  BEFORE UPDATE ON public.pinterest_board_quotas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();