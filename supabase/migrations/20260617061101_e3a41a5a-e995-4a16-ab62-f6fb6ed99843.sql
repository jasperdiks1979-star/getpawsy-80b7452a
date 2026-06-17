INSERT INTO public.app_config (key, value, updated_at)
VALUES ('sms_mode', to_jsonb('sales_only'::text), now())
ON CONFLICT (key) DO NOTHING;