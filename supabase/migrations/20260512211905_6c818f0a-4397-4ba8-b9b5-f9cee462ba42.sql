ALTER TABLE public.cta_copy_winners_by_hook
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by text;

CREATE INDEX IF NOT EXISTS idx_cta_copy_winners_by_hook_pinned
  ON public.cta_copy_winners_by_hook (pinned) WHERE pinned = true;