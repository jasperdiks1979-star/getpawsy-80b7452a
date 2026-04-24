-- Add client_ticket column for second-factor CSRF validation in the TikTok OAuth flow.
-- Stored when the start function generates the state, validated on callback.
ALTER TABLE public.tiktok_oauth_states
  ADD COLUMN IF NOT EXISTS client_ticket text;
