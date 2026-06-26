INSERT INTO public.app_config(key, value) VALUES
  ('pinterest_canary_mode', 'true'::jsonb),
  ('pinterest_canary_window_hours', '24'::jsonb),
  ('pinterest_canary_max_per_window', '1'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;