
-- CTA copy winner registry — one row per (placement, mode).
-- placement: 'bio_primary' | 'bio_secondary' | 'bio_sticky'
-- mode: 'calm' (pre-urgency) | 'urgent' (post-60% scroll)
-- winning_label: identifier matched to a label in the client copy registry.
CREATE TABLE IF NOT EXISTS public.cta_copy_winners (
  id BIGSERIAL PRIMARY KEY,
  placement TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('calm','urgent')),
  winning_label TEXT NOT NULL,
  ctr_pct NUMERIC(6,3),
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  window_hours INTEGER NOT NULL DEFAULT 48,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  UNIQUE(placement, mode)
);

ALTER TABLE public.cta_copy_winners ENABLE ROW LEVEL SECURITY;

-- Public read: the /go page must be able to fetch the active winners
-- without auth (cold TikTok traffic). No PII in this table.
CREATE POLICY "Anyone can read cta copy winners"
  ON public.cta_copy_winners FOR SELECT
  USING (true);

-- Writes only via service role (the elector edge function). No client policies.

-- Seed defaults so the page never reads an empty table on first load.
INSERT INTO public.cta_copy_winners (placement, mode, winning_label, notes) VALUES
  ('bio_primary',   'calm',   'get_yours_now',     'seed default'),
  ('bio_primary',   'urgent', 'claim_limited',     'seed default'),
  ('bio_secondary', 'calm',   'get_yours_now',     'seed default'),
  ('bio_secondary', 'urgent', 'order_today_24h',   'seed default'),
  ('bio_sticky',    'calm',   'get_yours_now',     'seed default'),
  ('bio_sticky',    'urgent', 'tap_to_claim',      'seed default')
ON CONFLICT (placement, mode) DO NOTHING;
