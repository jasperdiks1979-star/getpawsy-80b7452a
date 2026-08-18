CREATE INDEX IF NOT EXISTS canonical_sessions_commercial_window_idx
  ON public.canonical_sessions (first_seen_at DESC)
  WHERE exclude_from_commercial = false;