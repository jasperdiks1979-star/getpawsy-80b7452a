CREATE OR REPLACE FUNCTION public.enforce_pin_copy_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
declare
  banned text[] := array[
    concat_ws(' ', 'stop', 'scooping'),
    concat_ws(' ', 'large', 'space,', 'no', 'pressure'),
    concat_ws(' ', 'a', 'box', 'that', 'manages', 'itself'),
    concat_ws(' ', 'shop', 'the', 'upgrade'),
    concat_ws(' ', 'discover', 'why'),
    concat_ws(' ', 'save', 'for', 'later'),
    concat_ws(' ', 'tired', 'of', 'litter'),
    concat_ws(' ', 'no', 'more', 'plastic', 'bag')
  ];
  phrase text;
  hay text;
  decoded_image text;
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

  -- Decode Cloudinary-encoded text in image URLs so baked overlay copy is scanned too.
  decoded_image := coalesce(new.pin_image_url, '');
  decoded_image := replace(decoded_image, '%20', ' ');
  decoded_image := replace(decoded_image, '%0A', ' ');
  decoded_image := replace(decoded_image, '+', ' ');

  hay := lower(
    coalesce(new.pin_title,'') || ' ' ||
    coalesce(new.pin_description,'') || ' ' ||
    coalesce(new.overlay_text,'') || ' ' ||
    decoded_image || ' ' ||
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