-- Add Cat Exercise Wheels subcategory under Cats
INSERT INTO public.categories (name, slug, parent_id, description, display_order, image_url)
SELECT 
  'Cat Exercise Wheels',
  'cat-exercise-wheels',
  id,
  'Indoor exercise wheels and treadmills for cats to stay active and healthy',
  15,
  '/categories/cat-trees.jpg'
FROM public.categories
WHERE slug = 'cats'
ON CONFLICT (slug) DO NOTHING;