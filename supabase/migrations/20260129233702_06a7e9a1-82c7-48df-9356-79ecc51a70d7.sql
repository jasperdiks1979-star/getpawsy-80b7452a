-- Add missing Small Pets parent category
INSERT INTO categories (id, name, slug, description, display_order, icon)
VALUES (
  gen_random_uuid(),
  'Small Pets',
  'small-pets',
  'Supplies for hamsters, rabbits, guinea pigs and other small pets',
  5,
  '🐹'
)
ON CONFLICT (slug) DO NOTHING;

-- Update existing small pet categories to have this as parent
UPDATE categories 
SET parent_id = (SELECT id FROM categories WHERE slug = 'small-pets' LIMIT 1)
WHERE slug IN ('hamsters', 'rabbits', 'guinea-pigs', 'hamster-cages', 'hamster-wheels', 'rabbit-cages', 'guinea-pig-cages', 'guinea-pig-toys')
AND parent_id IS NULL;