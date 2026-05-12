ALTER TABLE public.cta_copy_winners_by_hook
  ADD COLUMN IF NOT EXISTS confidence_score numeric;