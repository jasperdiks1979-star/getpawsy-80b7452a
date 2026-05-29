-- TRK-1: Additive tracking-quality columns + missing grants.
-- Non-destructive: only adds columns, indexes, and grants.

-- 1) Add classification / qa / device / geo_tier columns (nullable, no defaults that rewrite existing rows)
ALTER TABLE public.lp_funnel_events
  ADD COLUMN IF NOT EXISTS classification text,        -- verified_user | probable_user | bot_like | legacy_unknown | qa
  ADD COLUMN IF NOT EXISTS qa boolean DEFAULT false,   -- true = QA/simulated event, excluded from Clean KPIs
  ADD COLUMN IF NOT EXISTS geo_tier text,              -- verified_us | probable_us | non_us | unknown | bot_like
  ADD COLUMN IF NOT EXISTS geo_country text,
  ADD COLUMN IF NOT EXISTS device text,                -- mobile | tablet | desktop | unknown
  ADD COLUMN IF NOT EXISTS os_family text,
  ADD COLUMN IF NOT EXISTS browser_family text,
  ADD COLUMN IF NOT EXISTS in_app_browser text,
  ADD COLUMN IF NOT EXISTS degraded boolean DEFAULT false;

-- 2) Same additive columns on checkout_funnel_events (best-effort; column may already exist)
ALTER TABLE public.checkout_funnel_events
  ADD COLUMN IF NOT EXISTS classification text,
  ADD COLUMN IF NOT EXISTS qa boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS geo_tier text,
  ADD COLUMN IF NOT EXISTS geo_country text,
  ADD COLUMN IF NOT EXISTS device text,
  ADD COLUMN IF NOT EXISTS os_family text,
  ADD COLUMN IF NOT EXISTS browser_family text,
  ADD COLUMN IF NOT EXISTS in_app_browser text;

-- 3) Indexes to make admin "Clean" filter fast
CREATE INDEX IF NOT EXISTS idx_lp_funnel_events_classification_created
  ON public.lp_funnel_events (classification, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lp_funnel_events_qa
  ON public.lp_funnel_events (qa) WHERE qa = true;
CREATE INDEX IF NOT EXISTS idx_lp_funnel_events_geo_tier
  ON public.lp_funnel_events (geo_tier);
CREATE INDEX IF NOT EXISTS idx_lp_funnel_events_device
  ON public.lp_funnel_events (device);

-- 4) Fix the GRANTs — currently only sandbox_exec has access; PostgREST runs as
-- anon/authenticated and tracking inserts will silently break on any role change.
GRANT SELECT, INSERT ON public.lp_funnel_events TO anon;
GRANT SELECT, INSERT ON public.lp_funnel_events TO authenticated;
GRANT ALL ON public.lp_funnel_events TO service_role;

GRANT SELECT, INSERT ON public.checkout_funnel_events TO anon;
GRANT SELECT, INSERT ON public.checkout_funnel_events TO authenticated;
GRANT ALL ON public.checkout_funnel_events TO service_role;