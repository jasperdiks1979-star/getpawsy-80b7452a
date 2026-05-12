-- Phase 24 — Per-hook_family CTA copy winners.
-- Stores the auto-elected winning label per (placement, mode, hook_family)
-- triple so cohort-aware copy is learned from real clicks instead of the
-- hardcoded HOOK_FAMILY_COPY_PREFERENCE map.
CREATE TABLE IF NOT EXISTS public.cta_copy_winners_by_hook (
  id BIGSERIAL PRIMARY KEY,
  placement TEXT NOT NULL,
  mode TEXT NOT NULL,
  hook_family TEXT NOT NULL,
  winning_label TEXT NOT NULL,
  ctr_pct NUMERIC,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  window_hours INTEGER NOT NULL DEFAULT 48,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  CONSTRAINT cta_copy_winners_by_hook_unique UNIQUE (placement, mode, hook_family)
);

CREATE INDEX IF NOT EXISTS idx_cta_copy_winners_by_hook_lookup
  ON public.cta_copy_winners_by_hook (placement, mode, hook_family);

ALTER TABLE public.cta_copy_winners_by_hook ENABLE ROW LEVEL SECURITY;

-- Public read so the page can resolve cohort copy without auth.
CREATE POLICY "cta_copy_winners_by_hook_public_read"
  ON public.cta_copy_winners_by_hook
  FOR SELECT
  USING (true);

-- Service role inserts/updates via the elector edge function (no policy
-- needed — service role bypasses RLS).