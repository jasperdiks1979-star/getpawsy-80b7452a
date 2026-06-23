-- Replace prior schedule if it exists (idempotent)
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'product-intelligence-supervisor-2min';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'product-intelligence-supervisor-2min',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url:='https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/product-intelligence-orchestrator',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc"}'::jsonb,
    body:='{"action":"supervisor","trigger_source":"supervisor"}'::jsonb
  );
  $$
);