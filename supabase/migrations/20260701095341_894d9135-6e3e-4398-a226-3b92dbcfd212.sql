DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pre_evaluations; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pinterest_pin_queue; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
ALTER TABLE public.pre_evaluations REPLICA IDENTITY FULL;
ALTER TABLE public.pinterest_pin_queue REPLICA IDENTITY FULL;