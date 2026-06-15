
-- Extend pinterest_credit_state with forecasting + manual controls
ALTER TABLE public.pinterest_credit_state
  ADD COLUMN IF NOT EXISTS credits_balance_initial numeric,
  ADD COLUMN IF NOT EXISTS credits_balance_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS credits_used_since_set numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_remaining numeric,
  ADD COLUMN IF NOT EXISTS avg_credits_per_creative numeric,
  ADD COLUMN IF NOT EXISTS daily_burn_rate numeric,
  ADD COLUMN IF NOT EXISTS estimated_creatives_remaining integer,
  ADD COLUMN IF NOT EXISTS estimated_hours_remaining numeric,
  ADD COLUMN IF NOT EXISTS estimated_days_remaining numeric,
  ADD COLUMN IF NOT EXISTS estimated_depletion_at timestamptz,
  ADD COLUMN IF NOT EXISTS forecast_state text,
  ADD COLUMN IF NOT EXISTS emergency_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_pause boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_pause_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_pause_reason text,
  ADD COLUMN IF NOT EXISTS last_24h_alert_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS alert_recipient_email text,
  ADD COLUMN IF NOT EXISTS emergency_creative_threshold integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS forecast_updated_at timestamptz;

-- Extend events with per-creative attribution + token cost
ALTER TABLE public.pinterest_credit_events
  ADD COLUMN IF NOT EXISTS credits_used numeric,
  ADD COLUMN IF NOT EXISTS tokens_used integer,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS pin_queue_id uuid,
  ADD COLUMN IF NOT EXISTS product_slug text,
  ADD COLUMN IF NOT EXISTS category_slug text;

CREATE INDEX IF NOT EXISTS pinterest_credit_events_success_idx
  ON public.pinterest_credit_events (created_at DESC)
  WHERE event_type = 'success';
