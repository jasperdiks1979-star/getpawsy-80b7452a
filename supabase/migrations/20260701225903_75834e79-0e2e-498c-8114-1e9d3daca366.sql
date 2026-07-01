
-- Backfill task queue: catalog historical financial artifacts that lack recovered evidence documents.
CREATE TABLE public.finance_backfill_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type TEXT NOT NULL,           -- 'order' | 'subscription' | 'ad_spend' | 'payment' | 'stripe_charge' | 'other'
  source_id TEXT NOT NULL,             -- id from source table / stripe id
  supplier_hint TEXT,
  reference TEXT,                      -- invoice # / txn ref
  document_date DATE,
  amount_minor BIGINT,
  currency TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'in_progress' | 'resolved' | 'wont_fix'
  priority TEXT NOT NULL DEFAULT 'medium', -- 'low'|'medium'|'high'
  reason TEXT NOT NULL,                -- why the task exists (e.g. "no evidence_document with reference X")
  auto_recover_attempted BOOLEAN NOT NULL DEFAULT false,
  auto_recover_result TEXT,
  linked_document_id UUID REFERENCES public.evidence_documents(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id)
);

CREATE INDEX finance_backfill_tasks_status_idx ON public.finance_backfill_tasks(status, priority, document_date DESC);
CREATE INDEX finance_backfill_tasks_source_idx ON public.finance_backfill_tasks(source_type, source_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_backfill_tasks TO authenticated;
GRANT ALL ON public.finance_backfill_tasks TO service_role;

ALTER TABLE public.finance_backfill_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read backfill tasks"
  ON public.finance_backfill_tasks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can modify backfill tasks"
  ON public.finance_backfill_tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_finance_backfill_tasks_updated
BEFORE UPDATE ON public.finance_backfill_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Scan runs log
CREATE TABLE public.finance_backfill_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',  -- running|success|failed
  scanned_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  candidates_seen INTEGER NOT NULL DEFAULT 0,
  auto_recovered INTEGER NOT NULL DEFAULT 0,
  tasks_created INTEGER NOT NULL DEFAULT 0,
  tasks_updated INTEGER NOT NULL DEFAULT 0,
  triggered_by UUID,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.finance_backfill_scans TO authenticated;
GRANT ALL ON public.finance_backfill_scans TO service_role;

ALTER TABLE public.finance_backfill_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read scans"
  ON public.finance_backfill_scans FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins write scans"
  ON public.finance_backfill_scans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
