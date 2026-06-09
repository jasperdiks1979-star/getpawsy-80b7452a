GRANT ALL ON public.pinterest_pin_dimensions TO service_role;
GRANT ALL ON public.pinterest_analytics_daily TO service_role;
GRANT ALL ON public.pinterest_attribution_sessions TO service_role;
GRANT ALL ON public.pinterest_funnel_events TO service_role;
GRANT ALL ON public.utm_session_log TO service_role;

GRANT SELECT ON public.pinterest_pin_dimensions TO authenticated;
GRANT SELECT ON public.pinterest_analytics_daily TO authenticated;
GRANT SELECT, INSERT ON public.pinterest_attribution_sessions TO authenticated;
GRANT SELECT, INSERT ON public.pinterest_funnel_events TO authenticated;
GRANT SELECT, INSERT ON public.utm_session_log TO authenticated;

GRANT INSERT ON public.pinterest_attribution_sessions TO anon;
GRANT INSERT ON public.pinterest_funnel_events TO anon;
GRANT INSERT ON public.utm_session_log TO anon;