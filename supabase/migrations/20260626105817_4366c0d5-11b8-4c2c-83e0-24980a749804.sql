
SELECT cron.schedule(
  'pqif-nightly-audit',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/pqif-nightly-audit',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
SELECT cron.schedule(
  'pqif-learning-loop',
  '15 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/pqif-learning-loop',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
