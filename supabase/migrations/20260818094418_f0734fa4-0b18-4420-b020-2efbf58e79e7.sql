SELECT cron.schedule('gp-analytics-cache-warm', '*/10 * * * *',
  $$SELECT public.gp_analytics_cache_refresh(ARRAY[24,168,720,2160])$$);
SELECT public.gp_analytics_cache_refresh(ARRAY[24,168,720,2160]);