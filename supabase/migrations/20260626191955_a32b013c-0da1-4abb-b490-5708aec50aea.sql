
ALTER TABLE public.pcie2_publish_queue
  ADD COLUMN IF NOT EXISTS ci_version text,
  ADD COLUMN IF NOT EXISTS ci_passed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ci_score numeric,
  ADD COLUMN IF NOT EXISTS quality_fingerprint text,
  ADD COLUMN IF NOT EXISTS semantic_fingerprint text,
  ADD COLUMN IF NOT EXISTS rewrite_fingerprint text,
  ADD COLUMN IF NOT EXISTS image_fingerprint text,
  ADD COLUMN IF NOT EXISTS headline_fingerprint text;

CREATE OR REPLACE FUNCTION public.pcie2_enforce_ci_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce on rows that aim for the publishable lifecycle.
  IF NEW.status IN ('ready','queued','pending','publishing') THEN
    IF NEW.ci_version IS NULL
       OR NEW.ci_passed_at IS NULL
       OR NEW.quality_fingerprint IS NULL
       OR NEW.semantic_fingerprint IS NULL
       OR NEW.headline_fingerprint IS NULL
       OR NEW.image_fingerprint IS NULL
       OR COALESCE(NEW.ci_score, 0) < 60 THEN
      RAISE EXCEPTION 'LEGACY_PIPELINE_DISABLED: pcie2_publish_queue requires Creative Intelligence stamp (ci_version, ci_passed_at, ci_score>=60, all fingerprints). Route via pcie2-publish-assembler.'
        USING ERRCODE = '42501';
    END IF;

    -- Auto-rerun marker: if mutable fields change post-insert, clear the gate.
    IF TG_OP = 'UPDATE' THEN
      IF NEW.headline IS DISTINCT FROM OLD.headline
         OR NEW.image_url IS DISTINCT FROM OLD.image_url
         OR NEW.board_id IS DISTINCT FROM OLD.board_id
         OR NEW.destination_url IS DISTINCT FROM OLD.destination_url THEN
        IF NEW.ci_version = OLD.ci_version AND NEW.ci_passed_at = OLD.ci_passed_at THEN
          RAISE EXCEPTION 'LEGACY_PIPELINE_DISABLED: mutated fields without CI re-stamp.'
            USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pcie2_publish_queue_ci_gate ON public.pcie2_publish_queue;
CREATE TRIGGER pcie2_publish_queue_ci_gate
  BEFORE INSERT OR UPDATE ON public.pcie2_publish_queue
  FOR EACH ROW EXECUTE FUNCTION public.pcie2_enforce_ci_gate();

CREATE TABLE IF NOT EXISTS public.pcie2_quality_loop_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  rescored int NOT NULL DEFAULT 0,
  rewritten int NOT NULL DEFAULT 0,
  retired int NOT NULL DEFAULT 0,
  drafts_generated int NOT NULL DEFAULT 0,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.pcie2_quality_loop_runs TO authenticated;
GRANT ALL ON public.pcie2_quality_loop_runs TO service_role;
ALTER TABLE public.pcie2_quality_loop_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pcie2_qloop_admin_read" ON public.pcie2_quality_loop_runs
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
