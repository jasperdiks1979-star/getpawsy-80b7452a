create or replace function public.enforce_pin_copy_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  banned text[] := array[
    concat_ws(' ', 'stop', 'scooping'),
    concat_ws(' ', 'large', 'space,', 'no', 'pressure'),
    concat_ws(' ', 'a', 'box', 'that', 'manages', 'itself')
  ];
  phrase text;
  hay text;
  ov text;
begin
  if new.status in ('archived','failed','rejected','deleted','error') then
    return new;
  end if;

  ov := coalesce(new.overlay_text, '');
  if length(btrim(ov)) > 0 then
    if char_length(ov) > 32 then
      raise exception 'pin_copy_invalid:overlay_too_long:%', char_length(ov) using errcode = '23514';
    end if;
    if ov ~ '[\r\n]' then
      raise exception 'pin_copy_invalid:overlay_multiline' using errcode = '23514';
    end if;
    if ov ~ '[|•]' then
      raise exception 'pin_copy_invalid:overlay_multiple_segments' using errcode = '23514';
    end if;
  end if;

  hay := lower(
    coalesce(new.pin_title,'') || ' ' ||
    coalesce(new.pin_description,'') || ' ' ||
    coalesce(new.overlay_text,'') || ' ' ||
    coalesce(new.meta::text,'')
  );
  foreach phrase in array banned loop
    if position(phrase in hay) > 0 then
      raise exception 'pin_copy_invalid:banned_phrase:%', phrase using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;