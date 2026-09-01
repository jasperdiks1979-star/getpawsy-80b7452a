create table if not exists public.pinterest_budget_restore_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null,
  ad_account_id text not null,
  temp_budget_micro bigint not null,
  restore_budget_micro bigint not null,
  restore_at timestamptz not null,
  status text not null default 'pending',
  note text,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

grant all on public.pinterest_budget_restore_jobs to service_role;
alter table public.pinterest_budget_restore_jobs enable row level security;

drop policy if exists "admins read budget restore jobs" on public.pinterest_budget_restore_jobs;
create policy "admins read budget restore jobs"
on public.pinterest_budget_restore_jobs for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

grant select on public.pinterest_budget_restore_jobs to authenticated;

insert into public.pinterest_budget_restore_jobs
  (campaign_id, ad_account_id, temp_budget_micro, restore_budget_micro, restore_at)
values ('626759717867', '549770199501', 10000000, 5000000, timestamptz '2026-09-06 12:53:29+00');

do $$ begin perform cron.unschedule('pinterest-budget-restore-hourly'); exception when others then null; end $$;

select cron.schedule('pinterest-budget-restore-hourly', '7 * * * *', $$
  select net.http_post(
    url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/pinterest-budget-restore',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000);
$$);