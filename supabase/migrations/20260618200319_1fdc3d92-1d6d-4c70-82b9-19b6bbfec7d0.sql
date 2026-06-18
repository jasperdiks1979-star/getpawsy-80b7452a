ALTER TABLE public.cinematic_v4_storyboards
  ADD COLUMN IF NOT EXISTS github_run_id text,
  ADD COLUMN IF NOT EXISTS github_run_url text,
  ADD COLUMN IF NOT EXISTS last_render_dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS render_error text;
CREATE INDEX IF NOT EXISTS cv4_storyboards_github_run_idx ON public.cinematic_v4_storyboards (github_run_id);