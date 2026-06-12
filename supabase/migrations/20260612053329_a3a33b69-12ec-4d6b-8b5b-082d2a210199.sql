
-- 1. Image blocklist for known-bad creatives.
CREATE TABLE IF NOT EXISTS public.pinterest_image_blocklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url TEXT NOT NULL,
  image_hash TEXT,
  reason TEXT NOT NULL,
  original_pin_id UUID,
  external_pin_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pinterest_image_blocklist_url_uniq
  ON public.pinterest_image_blocklist (image_url);
CREATE INDEX IF NOT EXISTS pinterest_image_blocklist_hash_idx
  ON public.pinterest_image_blocklist (image_hash) WHERE image_hash IS NOT NULL;

GRANT SELECT ON public.pinterest_image_blocklist TO authenticated;
GRANT ALL ON public.pinterest_image_blocklist TO service_role;

ALTER TABLE public.pinterest_image_blocklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage image blocklist" ON public.pinterest_image_blocklist;
CREATE POLICY "Admins manage image blocklist"
  ON public.pinterest_image_blocklist
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Extend banned-phrase trigger with new entries.
CREATE OR REPLACE FUNCTION public.enforce_pin_copy_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  banned text[] := array[
    'stop scooping',
    'large space, no pressure',
    'a box that manages itself',
    'shop the upgrade',
    'discover why',
    'save for later',
    'tired of litter',
    'no more plastic bag',
    'plush, warm, easy to wash',
    'plush warm easy to wash',
    'shop the viral find',
    'explore the trend',
    'see it in action',
    'see the setup',
    'clean with ease',
    'automate it',
    'tired of litter box chores'
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
$function$;
