UPDATE public.pcie2_creative_jobs
SET status = 'skipped',
    last_error = COALESCE(last_error, 'target_reached: library 1514>=1500; drained by finalization'),
    completed_at = now()
WHERE status = 'queued';