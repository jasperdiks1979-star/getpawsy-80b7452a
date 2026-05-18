create or replace function public.claim_cinematic_ad_job(
  p_worker_id text,
  p_job_id uuid default null
)
returns table (
  id uuid,
  product_slug text,
  hook_variant text,
  scene_assets jsonb,
  vo_url text,
  music_url text,
  render_token text,
  render_attempts integer,
  previous_status text,
  render_worker_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.cinematic_ad_jobs%rowtype;
begin
  if nullif(trim(coalesce(p_worker_id, '')), '') is null then
    raise exception 'worker_id is required';
  end if;

  if p_job_id is not null then
    select * into v_job
    from public.cinematic_ad_jobs
    where cinematic_ad_jobs.id = p_job_id
    for update skip locked;

    if not found then
      return;
    end if;

    if v_job.status = 'rendering'
       and v_job.render_worker_id is not null
       and v_job.render_worker_id <> p_worker_id then
      return;
    end if;
  else
    select * into v_job
    from public.cinematic_ad_jobs
    where status = 'render_queued'
    order by render_queued_at asc nulls last, created_at asc
    limit 1
    for update skip locked;

    if not found then
      return;
    end if;
  end if;

  return query
  update public.cinematic_ad_jobs as j
  set
    status = 'rendering',
    render_worker_id = p_worker_id,
    render_started_at = now(),
    render_attempts = coalesce(j.render_attempts, 0) + 1,
    status_message = 'worker ' || p_worker_id || ' claimed job',
    updated_at = now()
  where j.id = v_job.id
    and (
      p_job_id is not null
      or j.status = 'render_queued'
    )
    and not (
      j.status = 'rendering'
      and j.render_worker_id is not null
      and j.render_worker_id <> p_worker_id
    )
  returning
    j.id,
    j.product_slug,
    j.hook_variant,
    j.scene_assets,
    j.vo_url,
    j.music_url,
    j.render_token,
    j.render_attempts,
    v_job.status as previous_status,
    j.render_worker_id;
end;
$$;

grant execute on function public.claim_cinematic_ad_job(text, uuid) to service_role;