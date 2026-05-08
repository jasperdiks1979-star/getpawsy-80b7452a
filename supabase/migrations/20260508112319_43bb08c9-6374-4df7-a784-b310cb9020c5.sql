-- Add domination_mode toggle to runtime settings
ALTER TABLE public.pinterest_runtime_settings
  ADD COLUMN IF NOT EXISTS domination_mode boolean NOT NULL DEFAULT false;

-- Add style_affinity to boards (which pin styles route here)
ALTER TABLE public.pinterest_boards
  ADD COLUMN IF NOT EXISTS style_affinity text[] NOT NULL DEFAULT ARRAY[]::text[];

-- Seed style affinity from board names where possible
UPDATE public.pinterest_boards SET style_affinity = ARRAY['viral','benefit','lifestyle']
  WHERE style_affinity = ARRAY[]::text[] AND name ILIKE '%smart pet gadgets%';
UPDATE public.pinterest_boards SET style_affinity = ARRAY['lifestyle','benefit']
  WHERE style_affinity = ARRAY[]::text[] AND (name ILIKE '%modern cat home%' OR name ILIKE '%cat home%');
UPDATE public.pinterest_boards SET style_affinity = ARRAY['problem','infographic','benefit']
  WHERE style_affinity = ARRAY[]::text[] AND name ILIKE '%automatic litter%';
UPDATE public.pinterest_boards SET style_affinity = ARRAY['lifestyle','before_after','viral']
  WHERE style_affinity = ARRAY[]::text[] AND name ILIKE '%cat tree%';
UPDATE public.pinterest_boards SET style_affinity = ARRAY['benefit','infographic','problem']
  WHERE style_affinity = ARRAY[]::text[] AND (name ILIKE '%cat care%' OR name ILIKE '%essentials%');
UPDATE public.pinterest_boards SET style_affinity = ARRAY['viral','before_after','lifestyle']
  WHERE style_affinity = ARRAY[]::text[] AND name ILIKE '%pet parent hack%';
-- Default fallback: any board with no affinity gets the generic styles
UPDATE public.pinterest_boards SET style_affinity = ARRAY['benefit','lifestyle']
  WHERE style_affinity = ARRAY[]::text[];