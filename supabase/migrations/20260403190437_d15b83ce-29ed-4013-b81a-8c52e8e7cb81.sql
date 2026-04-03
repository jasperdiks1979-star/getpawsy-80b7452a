
UPDATE seo_collections SET is_active = false
WHERE slug IN (
  'best-interactive-cat-toys',
  'best-orthopedic-dog-beds',
  'best-slow-feeder-dog-bowls',
  'cat-beds',
  'cat-carriers',
  'cat-furniture',
  'cat-grooming-tools',
  'cat-harnesses',
  'cat-scratching-posts',
  'cat-toys',
  'cat-tunnels',
  'cat-water-fountains',
  'cat-window-perches',
  'dog-bowls',
  'dog-car-seats',
  'dog-coats-jackets',
  'dog-collars',
  'dog-crates',
  'dog-grooming-tools',
  'dog-harness',
  'dog-leashes',
  'dog-toys',
  'dog-training-tools',
  'dog-travel-accessories'
)
AND is_active = true;
