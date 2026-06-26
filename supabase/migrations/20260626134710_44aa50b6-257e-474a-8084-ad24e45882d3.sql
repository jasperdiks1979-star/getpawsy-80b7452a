
-- Single-row authoritative status
CREATE TABLE public.guardian_status (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  color TEXT NOT NULL DEFAULT 'gray' CHECK (color IN ('green','yellow','red','gray')),
  score INTEGER NOT NULL DEFAULT 0,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_run_id UUID,
  last_run_at TIMESTAMPTZ,
  build_hash TEXT,
  expected_build_hash TEXT,
  publish_gate_open BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.guardian_status TO authenticated;
GRANT ALL ON public.guardian_status TO service_role;
ALTER TABLE public.guardian_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read guardian_status" ON public.guardian_status FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.guardian_status (id) VALUES (TRUE) ON CONFLICT DO NOTHING;

CREATE TABLE public.guardian_sentinel_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  trigger TEXT NOT NULL DEFAULT 'manual',
  verdict TEXT,
  score INTEGER,
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  build_hash TEXT,
  notes TEXT
);
GRANT SELECT ON public.guardian_sentinel_runs TO authenticated;
GRANT ALL ON public.guardian_sentinel_runs TO service_role;
ALTER TABLE public.guardian_sentinel_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read sentinel runs" ON public.guardian_sentinel_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.guardian_sentinel_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.guardian_sentinel_runs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  target TEXT,
  status TEXT NOT NULL CHECK (status IN ('pass','warn','fail','skip')),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','low','medium','high','critical')),
  latency_ms INTEGER,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sentinel_checks_run ON public.guardian_sentinel_checks(run_id);
GRANT SELECT ON public.guardian_sentinel_checks TO authenticated;
GRANT ALL ON public.guardian_sentinel_checks TO service_role;
ALTER TABLE public.guardian_sentinel_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read sentinel checks" ON public.guardian_sentinel_checks FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.guardian_legacy_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  trigger TEXT NOT NULL DEFAULT 'manual',
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'running'
);
GRANT SELECT ON public.guardian_legacy_scans TO authenticated;
GRANT ALL ON public.guardian_legacy_scans TO service_role;
ALTER TABLE public.guardian_legacy_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read legacy scans" ON public.guardian_legacy_scans FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.guardian_legacy_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES public.guardian_legacy_scans(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  kind TEXT NOT NULL,
  identifier TEXT NOT NULL,
  duplicates JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk TEXT NOT NULL DEFAULT 'low' CHECK (risk IN ('low','medium','high','critical')),
  recommendation TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved_disable','disabled','archived','dismissed')),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_legacy_findings_scan ON public.guardian_legacy_findings(scan_id);
CREATE INDEX idx_legacy_findings_status ON public.guardian_legacy_findings(status);
GRANT SELECT ON public.guardian_legacy_findings TO authenticated;
GRANT ALL ON public.guardian_legacy_findings TO service_role;
ALTER TABLE public.guardian_legacy_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read legacy findings" ON public.guardian_legacy_findings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update legacy findings" ON public.guardian_legacy_findings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.guardian_notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL DEFAULT 'email',
  recipient TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','suppressed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_guardian_notif_status ON public.guardian_notification_queue(status, scheduled_at);
GRANT SELECT ON public.guardian_notification_queue TO authenticated;
GRANT ALL ON public.guardian_notification_queue TO service_role;
ALTER TABLE public.guardian_notification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read notifications" ON public.guardian_notification_queue FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.guardian_publish_gate_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow','block')),
  reason TEXT,
  guardian_color TEXT,
  guardian_score INTEGER,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_publish_gate_log_created ON public.guardian_publish_gate_log(created_at DESC);
GRANT SELECT ON public.guardian_publish_gate_log TO authenticated;
GRANT ALL ON public.guardian_publish_gate_log TO service_role;
ALTER TABLE public.guardian_publish_gate_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read gate log" ON public.guardian_publish_gate_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.guardian_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  target TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_guardian_audit_created ON public.guardian_audit_log(created_at DESC);
GRANT SELECT ON public.guardian_audit_log TO authenticated;
GRANT ALL ON public.guardian_audit_log TO service_role;
ALTER TABLE public.guardian_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit" ON public.guardian_audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
