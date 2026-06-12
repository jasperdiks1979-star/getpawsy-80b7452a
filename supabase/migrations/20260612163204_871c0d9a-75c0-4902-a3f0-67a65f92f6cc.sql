
-- 1. Extend trigger banned phrases
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
    'tired of litter box chores',
    'tired of',
    'read reviews',
    'see how'
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

-- 2. Identify flagged pins
WITH flagged AS (
  SELECT q.id, q.product_id, q.product_slug, q.product_name, q.board_name,
         q.category_key, q.hook_group, q.destination_link, q.hashtags,
         p.image_url AS product_image
  FROM public.pinterest_pin_queue q
  LEFT JOIN public.products p ON p.id = q.product_id
  WHERE q.status NOT IN ('archived','failed','rejected','deleted','error')
    AND (
      q.pin_title ILIKE '%stop scooping every day%' OR q.pin_description ILIKE '%stop scooping every day%' OR q.overlay_text ILIKE '%stop scooping every day%'
      OR q.pin_title ILIKE '%tired of scooping%' OR q.pin_description ILIKE '%tired of scooping%' OR q.overlay_text ILIKE '%tired of scooping%'
      OR q.pin_title ILIKE '%read reviews%' OR q.pin_description ILIKE '%read reviews%' OR q.overlay_text ILIKE '%read reviews%'
      OR q.pin_title ILIKE '%see how%' OR q.pin_description ILIKE '%see how%' OR q.overlay_text ILIKE '%see how%'
    )
),
-- 3. Insert deterministic safe replacement drafts (only when we have a clean product image)
inserted AS (
  INSERT INTO public.pinterest_pin_queue (
    product_id, product_slug, product_name, pin_variant,
    pin_title, pin_description, destination_link, board_name,
    hashtags, priority, status, hook_group, overlay_text,
    content_type, replacement_for_pin_id, pin_image_url, category_key
  )
  SELECT
    f.product_id,
    f.product_slug,
    f.product_name,
    'content_refresh_safe_v1',
    -- Title: clean, deterministic, ≤100 chars
    left(initcap(f.product_name) || ' — Trusted by US Pet Parents', 100),
    -- Description: generic, on-brand, no banned phrases
    'Discover ' || f.product_name || ' on getpawsy.pet. Curated for cats and dogs across the US — fast shipping and friendly support.',
    f.destination_link,
    f.board_name,
    coalesce(f.hashtags, '{}'::text[]),
    'high',
    'draft',
    f.hook_group,
    NULL, -- no overlay to guarantee no banned overlay text
    'product',
    f.id,
    f.product_image,
    f.category_key
  FROM flagged f
  WHERE f.product_image IS NOT NULL
    AND f.product_image NOT ILIKE '%stop scooping%'
    AND f.product_image NOT ILIKE '%tired of%'
    AND f.product_image NOT ILIKE '%read reviews%'
    AND f.product_image NOT ILIKE '%see how%'
  RETURNING id, replacement_for_pin_id
),
-- 4. Archive the originals (reject + reason)
archived AS (
  UPDATE public.pinterest_pin_queue q
  SET status = 'rejected',
      rejection_reason = 'content_refresh_banned_phrase_2026_06_12',
      updated_at = now()
  FROM flagged f
  WHERE q.id = f.id
  RETURNING q.id
)
SELECT
  (SELECT count(*) FROM flagged)  AS flagged_count,
  (SELECT count(*) FROM inserted) AS replacements_inserted,
  (SELECT count(*) FROM archived) AS archived_count;
