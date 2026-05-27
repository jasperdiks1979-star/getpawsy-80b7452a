ALTER TABLE public.smoke_test_runs ALTER COLUMN stripe_session_id DROP NOT NULL;
ALTER TABLE public.smoke_test_runs DROP CONSTRAINT IF EXISTS smoke_test_runs_status_check;
ALTER TABLE public.smoke_test_runs ADD CONSTRAINT smoke_test_runs_status_check CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'refunded'::text, 'failed'::text, 'expired'::text, 'error'::text]));