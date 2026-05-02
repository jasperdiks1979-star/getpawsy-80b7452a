
ALTER TABLE public.tiktok_server_events
  ADD COLUMN IF NOT EXISTS tiktok_code INTEGER
    GENERATED ALWAYS AS ( NULLIF((response_body->>'code'),'')::int ) STORED,
  ADD COLUMN IF NOT EXISTS tiktok_message TEXT
    GENERATED ALWAYS AS ( response_body->>'message' ) STORED,
  ADD COLUMN IF NOT EXISTS status TEXT
    GENERATED ALWAYS AS (
      CASE
        WHEN error IS NULL AND response_status BETWEEN 200 AND 299
             AND COALESCE(NULLIF(response_body->>'code',''),'0') = '0'
          THEN 'success'
        WHEN error LIKE '%not configured%' OR pixel_id IS NULL
          THEN 'config_error'
        WHEN response_status IS NULL
          THEN 'network_error'
        WHEN response_status BETWEEN 200 AND 299
          THEN 'tiktok_error'
        ELSE 'http_error'
      END
    ) STORED;

CREATE INDEX IF NOT EXISTS tiktok_server_events_status_created_idx
  ON public.tiktok_server_events (status, created_at DESC);
