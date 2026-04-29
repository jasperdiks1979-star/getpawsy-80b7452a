
CREATE OR REPLACE FUNCTION public.get_tiktok_bio_split(p_window_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_window_days integer;
  v_from timestamptz;
  v_per_hook jsonb;
  v_totals jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_window_days := greatest(1, least(coalesce(p_window_days, 30), 365));
  v_from := now() - make_interval(days => v_window_days);

  -- Per-session "is_bio" flag: a session is considered bio-link when it had
  -- at least one event with utm_content = 'tt_bio_link'. We aggregate at the
  -- session grain so a single session that fired both /go (bio) and PDP
  -- (where utm_content may be a deep-link placement like "bio_primary") is
  -- still attributed to bio. Hook is taken from utm_campaign.
  with base as (
    select
      lower(coalesce(nullif(va.utm_campaign, ''), '(none)')) as hook,
      va.session_id,
      va.activity_type,
      va.page_path,
      va.order_id,
      va.order_value,
      va.utm_content
    from public.visitor_activity va
    where va.created_at >= v_from
      and lower(coalesce(va.utm_source, '')) = 'tiktok'
      and coalesce(va.is_internal, false) = false
      and lower(coalesce(va.utm_campaign, '')) in ('hook1','hook2','hook3','hook4','hook5')
  ),
  session_flags as (
    select
      hook,
      session_id,
      bool_or(lower(coalesce(utm_content, '')) = 'tt_bio_link') as is_bio,
      bool_or(page_path like '/products/%') as has_pdp,
      bool_or(activity_type = 'cart') as has_cart,
      bool_or(activity_type = 'checkout') as has_checkout,
      max(case when order_id is not null then order_id end) as order_id,
      max(case when order_id is not null then order_value end) as order_value
    from base
    group by hook, session_id
  ),
  per_hook_split as (
    select
      hook,
      case when is_bio then 'bio' else 'other' end as bucket,
      count(*)::int as sessions,
      sum(has_pdp::int)::int as pdp_sessions,
      sum(has_cart::int)::int as cart_sessions,
      sum(has_checkout::int)::int as checkout_sessions,
      count(distinct order_id)::int as purchases,
      coalesce(sum(order_value), 0)::numeric as revenue
    from session_flags
    group by hook, case when is_bio then 'bio' else 'other' end
  ),
  per_hook_pivot as (
    select
      hook,
      coalesce(sum(case when bucket = 'bio'   then sessions          end), 0)::int as bio_sessions,
      coalesce(sum(case when bucket = 'other' then sessions          end), 0)::int as other_sessions,
      coalesce(sum(case when bucket = 'bio'   then pdp_sessions      end), 0)::int as bio_pdp,
      coalesce(sum(case when bucket = 'other' then pdp_sessions      end), 0)::int as other_pdp,
      coalesce(sum(case when bucket = 'bio'   then cart_sessions     end), 0)::int as bio_cart,
      coalesce(sum(case when bucket = 'other' then cart_sessions     end), 0)::int as other_cart,
      coalesce(sum(case when bucket = 'bio'   then checkout_sessions end), 0)::int as bio_checkout,
      coalesce(sum(case when bucket = 'other' then checkout_sessions end), 0)::int as other_checkout,
      coalesce(sum(case when bucket = 'bio'   then purchases         end), 0)::int as bio_purchases,
      coalesce(sum(case when bucket = 'other' then purchases         end), 0)::int as other_purchases,
      coalesce(sum(case when bucket = 'bio'   then revenue           end), 0)::numeric as bio_revenue,
      coalesce(sum(case when bucket = 'other' then revenue           end), 0)::numeric as other_revenue
    from per_hook_split
    group by hook
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'hook',             hook,
      'bio_sessions',     bio_sessions,
      'other_sessions',   other_sessions,
      'total_sessions',   bio_sessions + other_sessions,
      'bio_share',        case when (bio_sessions + other_sessions) > 0
                               then round((bio_sessions::numeric / (bio_sessions + other_sessions)) * 100, 2)
                               else 0 end,
      'bio_pdp',          bio_pdp,
      'other_pdp',        other_pdp,
      'bio_cart',         bio_cart,
      'other_cart',       other_cart,
      'bio_checkout',     bio_checkout,
      'other_checkout',   other_checkout,
      'bio_purchases',    bio_purchases,
      'other_purchases',  other_purchases,
      'bio_revenue',      bio_revenue,
      'other_revenue',    other_revenue,
      'bio_cvr',          case when bio_sessions   > 0 then round((bio_purchases::numeric   / bio_sessions)   * 100, 2) else 0 end,
      'other_cvr',        case when other_sessions > 0 then round((other_purchases::numeric / other_sessions) * 100, 2) else 0 end,
      'bio_aov',          case when bio_purchases   > 0 then round(bio_revenue   / bio_purchases,   2) else 0 end,
      'other_aov',        case when other_purchases > 0 then round(other_revenue / other_purchases, 2) else 0 end
    )
    order by hook
  ), '[]'::jsonb)
  into v_per_hook
  from per_hook_pivot;

  -- Roll-up across all 5 hooks: useful for the widget header card so the
  -- user sees "X% of all TikTok hook traffic is bio-link" at a glance.
  with base as (
    select
      va.session_id,
      va.utm_content,
      va.activity_type,
      va.page_path,
      va.order_id,
      va.order_value
    from public.visitor_activity va
    where va.created_at >= v_from
      and lower(coalesce(va.utm_source, '')) = 'tiktok'
      and coalesce(va.is_internal, false) = false
      and lower(coalesce(va.utm_campaign, '')) in ('hook1','hook2','hook3','hook4','hook5')
  ),
  flagged as (
    select
      session_id,
      bool_or(lower(coalesce(utm_content, '')) = 'tt_bio_link') as is_bio,
      max(case when order_id is not null then order_id end) as order_id,
      max(case when order_id is not null then order_value end) as order_value
    from base
    group by session_id
  )
  select jsonb_build_object(
    'bio_sessions',    sum(is_bio::int)::int,
    'other_sessions',  sum((not is_bio)::int)::int,
    'total_sessions',  count(*)::int,
    'bio_share',       case when count(*) > 0
                            then round((sum(is_bio::int)::numeric / count(*)) * 100, 2)
                            else 0 end,
    'bio_purchases',   count(distinct case when is_bio       and order_id is not null then order_id end)::int,
    'other_purchases', count(distinct case when not is_bio   and order_id is not null then order_id end)::int,
    'bio_revenue',     coalesce(sum(case when is_bio     and order_id is not null then order_value end), 0)::numeric,
    'other_revenue',   coalesce(sum(case when not is_bio and order_id is not null then order_value end), 0)::numeric
  )
  into v_totals
  from flagged;

  return jsonb_build_object(
    'window_days', v_window_days,
    'from',        v_from,
    'totals',      v_totals,
    'per_hook',    v_per_hook
  );
end;
$function$;
