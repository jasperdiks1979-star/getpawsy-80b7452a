
CREATE OR REPLACE FUNCTION public.cinematic_v3_auto_verdict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  all_hundred boolean := false;
  reasons_empty boolean := false;
  real_reason_count integer := 0;
BEGIN
  IF NEW.failure_reasons IS NULL THEN
    reasons_empty := true;
  ELSE
    SELECT count(*) INTO real_reason_count
    FROM unnest(NEW.failure_reasons) AS r
    WHERE r IS NOT NULL AND btrim(r) <> '';
    reasons_empty := (real_reason_count = 0);
  END IF;

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
