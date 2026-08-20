do $$
declare j text;
begin
  foreach j in array array['analytics-canonical-warmer-hot','analytics-canonical-warmer-14d','analytics-canonical-warmer-30d','analytics-canonical-warmer-90d']
  loop
    begin perform cron.unschedule(j); exception when others then null; end;
  end loop;
end $$;

create or replace function internal_config.schedule_analytics_warm(p_name text, p_sched text, p_hours int, p_geo text)
returns void language plpgsql security definer set search_path = public, cron, internal_config as $$
begin
  begin perform cron.unschedule(p_name); exception when others then null; end;
  perform cron.schedule(p_name, p_sched, format($f$
    SELECT net.http_post(
      url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/analytics-canonical-warmer',
      headers := jsonb_build_object('Content-Type','application/json','x-internal-secret',
        (SELECT value FROM internal_config.warmer_auth WHERE key = 'analytics_warmer_secret')),
      body := '{"hours":%s,"geo":"%s"}'::jsonb,
      timeout_milliseconds := 15000);
  $f$, p_hours, p_geo));
end $$;

select internal_config.schedule_analytics_warm('acw-1h-all',   '*/5 * * * *',    1,    'all');
select internal_config.schedule_analytics_warm('acw-1h-us',    '1-59/5 * * * *', 1,    'US');
select internal_config.schedule_analytics_warm('acw-24h-all',  '2-59/5 * * * *', 24,   'all');
select internal_config.schedule_analytics_warm('acw-24h-us',   '3-59/5 * * * *', 24,   'US');
select internal_config.schedule_analytics_warm('acw-7d-all',   '4-59/10 * * * *',168,  'all');
select internal_config.schedule_analytics_warm('acw-7d-us',    '9-59/10 * * * *',168,  'US');
select internal_config.schedule_analytics_warm('acw-14d-all',  '6-59/10 * * * *',336,  'all');
select internal_config.schedule_analytics_warm('acw-14d-us',   '11-59/10 * * * *',336, 'US');
select internal_config.schedule_analytics_warm('acw-30d-all',  '8-59/15 * * * *',720,  'all');
select internal_config.schedule_analytics_warm('acw-30d-us',   '13-59/15 * * * *',720, 'US');
select internal_config.schedule_analytics_warm('acw-90d-all',  '17-59/30 * * * *',2160,'all');
select internal_config.schedule_analytics_warm('acw-90d-us',   '27-59/30 * * * *',2160,'US');