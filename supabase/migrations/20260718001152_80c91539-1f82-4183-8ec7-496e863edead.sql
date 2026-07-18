INSERT INTO public.app_config(key, value) VALUES
  ('canonical_traffic_quality_v2.enabled', 'false'::jsonb),
  ('canonical_traffic_quality_v2.admin_only', 'true'::jsonb),
  ('canonical_traffic_quality_v2.phase4a_cutoff_iso', '"2026-07-17T23:20:00Z"'::jsonb)
ON CONFLICT (key) DO NOTHING;