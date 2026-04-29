create or replace function public.test_tiktok_exclusion_fixtures(p_prefix text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_now timestamptz := now();
  v_results jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_prefix := nullif(trim(coalesce(p_prefix, '')), '');
  if v_prefix is null or length(v_prefix) < 8 then
    raise exception 'p_prefix must be at least 8 chars' using errcode = '22023';
  end if;

  -- Safety: never let this helper touch rows outside its own prefix.
  delete from public.visitor_activity where session_id like v_prefix || '%';

  -- Fixture set: 1 clean session + 4 sessions each tripping a distinct rule.
  -- All carry utm_source=tiktok + utm_campaign=hookN so they'd otherwise be
  -- counted by every reporting RPC.
  insert into public.visitor_activity
    (session_id, activity_type, page_path, utm_source, utm_campaign, utm_content,
     country, browser, screen_width, is_internal, created_at, last_seen_at)
  values
    -- clean baseline — must be kept by every report
    (v_prefix || '_clean', 'pageview', '/go',                'tiktok','hook1','tt_bio_link',
     'United States','Chrome',1280,false, v_now, v_now),
    (v_prefix || '_clean', 'pageview', '/products/foo',      'tiktok','hook1','tt_bio_link',
     'United States','Chrome',1280,false, v_now, v_now),

    -- excluded by is_internal (one event flips the whole session)
    (v_prefix || '_internal', 'pageview', '/go',             'tiktok','hook2','tt_bio_link',
     'United States','Chrome',1280,true,  v_now, v_now),
    (v_prefix || '_internal', 'pageview', '/products/foo',   'tiktok','hook2','tt_bio_link',
     'United States','Chrome',1280,false, v_now, v_now),

    -- excluded by NL country
    (v_prefix || '_nl', 'pageview', '/go',                   'tiktok','hook3','tt_bio_link',
     'Netherlands','Chrome',1280,false, v_now, v_now),
    (v_prefix || '_nl', 'pageview', '/products/foo',         'tiktok','hook3','tt_bio_link',
     'Netherlands','Chrome',1280,false, v_now, v_now),

    -- excluded by admin route visit anywhere in the session
    (v_prefix || '_admin', 'pageview', '/go',                'tiktok','hook4','tt_bio_link',
     'United States','Chrome',1280,false, v_now, v_now),
    (v_prefix || '_admin', 'pageview', '/admin/dashboard',   'tiktok','hook4','tt_bio_link',
     'United States','Chrome',1280,false, v_now, v_now),

    -- excluded by bot heuristic (browser=unknown + screen_width=0)
    (v_prefix || '_bot', 'pageview', '/go',                  'tiktok','hook5','tt_bio_link',
     'United States','unknown',0,false, v_now, v_now),
    (v_prefix || '_bot', 'pageview', '/products/foo',        'tiktok','hook5','tt_bio_link',
     'United States','unknown',0,false, v_now, v_now);

  -- Mirror the exact exclusion CTE used by get_tiktok_hook_performance and
  -- get_tiktok_bio_split. If the production RPCs change, this assertion shifts
  -- with them and the test will still verify the documented rules.
  with all_sessions as (
    select session_id
    from public.visitor_activity
    where session_id like v_prefix || '%'
    group by session_id
  ),
  clean_sessions as (
    select va.session_id from public.visitor_activity va
    where va.session_id like v_prefix || '%'
    group by va.session_id
    having
          bool_or(coalesce(va.is_internal, false)) = false
      and bool_or(lower(coalesce(va.country, '')) in ('netherlands','nl')) = false
      and bool_or(coalesce(va.page_path, '') like '/admin%') = false
      and bool_or(coalesce(va.browser, '') = 'unknown' and coalesce(va.screen_width, 0) = 0) = false
  )
  select jsonb_object_agg(
    a.session_id,
    jsonb_build_object('kept', cs.session_id is not null)
    order by a.session_id
  )
  into v_results
  from all_sessions a
  left join clean_sessions cs on cs.session_id = a.session_id;

  -- Always clean up so concurrent test runs and prod data stay untouched.
  delete from public.visitor_activity where session_id like v_prefix || '%';

  return jsonb_build_object('prefix', v_prefix, 'results', v_results);
end;
$$;

revoke all on function public.test_tiktok_exclusion_fixtures(text) from public, anon;
grant execute on function public.test_tiktok_exclusion_fixtures(text) to authenticated;