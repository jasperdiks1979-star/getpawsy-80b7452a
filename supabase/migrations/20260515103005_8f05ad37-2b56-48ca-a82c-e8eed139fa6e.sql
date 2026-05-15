CREATE TABLE public.github_sync_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  branch text NOT NULL,
  branch_sha text NOT NULL,
  main_sha text NOT NULL,
  ahead_by int NOT NULL DEFAULT 0,
  behind_by int NOT NULL DEFAULT 0,
  message text,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz
);
CREATE UNIQUE INDEX github_sync_alerts_open_uniq
  ON public.github_sync_alerts (branch, branch_sha) WHERE resolved = false;
CREATE INDEX github_sync_alerts_created_idx ON public.github_sync_alerts (created_at DESC);

ALTER TABLE public.github_sync_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read alerts" ON public.github_sync_alerts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update alerts" ON public.github_sync_alerts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.github_sync_alerts;
ALTER TABLE public.github_sync_alerts REPLICA IDENTITY FULL;