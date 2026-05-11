
alter table public.pinterest_video_queue
  add column if not exists max_retries integer not null default 3,
  add column if not exists last_retry_at timestamptz;

create or replace function public.pvq_log_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.pinterest_video_publish_log (queue_id, stage, status, payload)
    values (new.id, 'status_change', new.status, jsonb_build_object('to', new.status, 'attempt', new.attempt_count));
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.pinterest_video_publish_log (queue_id, stage, status, payload)
    values (new.id, 'status_change', new.status, jsonb_build_object(
      'from', old.status, 'to', new.status,
      'attempt', new.attempt_count,
      'error', new.error_message
    ));
  end if;
  return new;
end $$;

drop trigger if exists pvq_status_log on public.pinterest_video_queue;
create trigger pvq_status_log
  after insert or update of status on public.pinterest_video_queue
  for each row execute function public.pvq_log_status_change();
