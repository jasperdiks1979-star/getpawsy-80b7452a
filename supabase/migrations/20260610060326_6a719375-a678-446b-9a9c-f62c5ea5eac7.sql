
CREATE TABLE IF NOT EXISTS public.pinterest_live_pin_repair_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_queue_id uuid REFERENCES public.pinterest_pin_queue(id) ON DELETE CASCADE,
  pinterest_pin_id text,
  product_slug text,
  category_key text,
  board_name text,
  overlay_text text,
  pin_title text,
  hook_group text,
  destination_link text,
  violation_types text[] NOT NULL DEFAULT '{}',
  recommended_action text NOT NULL CHECK (recommended_action IN ('replace','archive','regenerate')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','done')),
  audit_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plprq_status ON public.pinterest_live_pin_repair_queue(status);
CREATE INDEX IF NOT EXISTS idx_plprq_run ON public.pinterest_live_pin_repair_queue(audit_run_id);
CREATE INDEX IF NOT EXISTS idx_plprq_action ON public.pinterest_live_pin_repair_queue(recommended_action);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_live_pin_repair_queue TO authenticated;
GRANT ALL ON public.pinterest_live_pin_repair_queue TO service_role;

ALTER TABLE public.pinterest_live_pin_repair_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage live pin repair queue"
ON public.pinterest_live_pin_repair_queue
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_plprq_updated_at
BEFORE UPDATE ON public.pinterest_live_pin_repair_queue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
