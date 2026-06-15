
ALTER TABLE public.pinterest_credit_state
  ADD COLUMN IF NOT EXISTS ai_generation_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS publishing_paused boolean NOT NULL DEFAULT false;

-- Backfill: whatever was historically "paused" was an AI-generation pause.
UPDATE public.pinterest_credit_state
SET ai_generation_paused = COALESCE(paused, false)
WHERE id = 1;

COMMENT ON COLUMN public.pinterest_credit_state.ai_generation_paused IS
  'When true, Lovable AI Gateway calls (creative generation/regen) are paused. Set by credit guard on HTTP 402. Never blocks the publishing lane.';
COMMENT ON COLUMN public.pinterest_credit_state.publishing_paused IS
  'When true, Pinterest publishing lane is halted. Only set by explicit operator action — never by AI credit exhaustion.';
COMMENT ON COLUMN public.pinterest_credit_state.paused IS
  'DEPRECATED alias of ai_generation_paused. Kept for backward compatibility.';
