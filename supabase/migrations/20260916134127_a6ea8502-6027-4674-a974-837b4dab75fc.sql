CREATE TABLE IF NOT EXISTS public.commercial_rebuild_selection (
  slug text PRIMARY KEY,
  role text NOT NULL,
  rank integer,
  phase text NOT NULL DEFAULT 'phase1',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_rebuild_selection TO authenticated;
GRANT ALL ON public.commercial_rebuild_selection TO service_role;
ALTER TABLE public.commercial_rebuild_selection ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage rebuild selection" ON public.commercial_rebuild_selection
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));