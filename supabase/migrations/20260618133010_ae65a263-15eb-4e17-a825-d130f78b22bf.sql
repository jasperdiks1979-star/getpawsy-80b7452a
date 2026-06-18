
CREATE OR REPLACE FUNCTION public.cinematic_v3_auto_verdict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  all_hundred boolean := false;
  reasons_empty boolean := false;
  v record;
BEGIN
  reasons_empty := (NEW.failure_reasons IS NULL)
    OR (jsonb_typeof(to_jsonb(NEW.failure_reasons)) = 'array'
        AND jsonb_array_length(to_jsonb(NEW.failure_reasons)) = 0);

  IF NEW.qa_scores IS NOT NULL AND jsonb_typeof(NEW.qa_scores) = 'object' THEN
    all_hundred := NOT EXISTS (
      SELECT 1
      FROM jsonb_each(NEW.qa_scores) AS kv(k, val)
      WHERE COALESCE((val)::text::numeric, 0) <> 100
    );
  END IF;

  IF NEW.qa_total = 100 AND reasons_empty AND all_hundred THEN
    NEW.qa_passed := true;
    IF NEW.status IS DISTINCT FROM 'approved' THEN
      NEW.status := 'approved';
    END IF;
    IF NEW.approved_at IS NULL THEN
      NEW.approved_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cinematic_v3_auto_verdict ON public.cinematic_v3_jobs;
CREATE TRIGGER trg_cinematic_v3_auto_verdict
BEFORE INSERT OR UPDATE ON public.cinematic_v3_jobs
FOR EACH ROW EXECUTE FUNCTION public.cinematic_v3_auto_verdict();

-- Repair existing rows: touch updated_at so the BEFORE trigger fires
UPDATE public.cinematic_v3_jobs
SET updated_at = now()
WHERE qa_total = 100
  AND qa_passed = false
  AND (
    failure_reasons IS NULL
    OR (jsonb_typeof(to_jsonb(failure_reasons)) = 'array'
        AND jsonb_array_length(to_jsonb(failure_reasons)) = 0)
  )
  AND qa_scores IS NOT NULL
  AND jsonb_typeof(qa_scores) = 'object'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_each(qa_scores) AS kv(k, val)
    WHERE COALESCE((val)::text::numeric, 0) <> 100
  );
