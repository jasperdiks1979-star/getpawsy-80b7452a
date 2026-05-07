alter table public.pinterest_pin_queue
  add column if not exists board_id text,
  add column if not exists pinterest_pin_id text,
  add column if not exists external_url text,
  add column if not exists rejection_reason text;

update public.pinterest_pin_queue
set
  pinterest_pin_id = coalesce(pinterest_pin_id, pin_external_id),
  external_url = coalesce(external_url, case when pin_external_id is not null and pin_external_id <> '' then 'https://www.pinterest.com/pin/' || pin_external_id || '/' else null end)
where pin_external_id is not null;

create index if not exists idx_pinterest_pin_queue_publish_status
on public.pinterest_pin_queue (status, scheduled_at, approved_at)
where status in ('queued', 'publishing', 'failed', 'posted');