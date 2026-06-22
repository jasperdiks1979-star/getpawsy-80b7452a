-- Clear stale 'failed' product_intelligence rows that were actually credit-blocked (ai_402).
DELETE FROM public.product_intelligence WHERE scan_status = 'failed' AND scan_error = 'ai_402';

-- Allow a new run status value 'blocked_no_credits' (no constraint exists; values are free-text text column, no change needed).
-- Ensure report jsonb can carry diagnostics — no schema change required.
SELECT 1;