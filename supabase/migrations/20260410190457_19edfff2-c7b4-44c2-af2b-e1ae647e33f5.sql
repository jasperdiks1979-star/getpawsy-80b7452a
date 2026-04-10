-- Step 1: Remove product_categories links for all categories being deleted
DELETE FROM product_categories WHERE category_id IN (
  -- Grandchildren (under Small Pets → Hamsters/Guinea Pigs/Rabbits)
  'a088ed51-d583-46cc-8c66-57571c8d2183', -- Rabbit Cages
  '9d499ad9-048c-4210-a124-7066fcd64cda', -- Hamster Wheels
  'd2013111-8b64-4b77-a617-d421c0518f63', -- Guinea Pig Toys
  '599a97a1-c2a0-4e1d-a04e-a3bc130f7ac9', -- Hamster Cages
  '9adb48fb-b6f9-4196-bd1f-4a1f57c37a96', -- Guinea Pig Cages
  -- Bird children
  'cc78b320-e249-409c-8749-8232d21bc656', -- Bird Accessories
  '173baa34-c498-4102-8147-d1f6267c97a1', -- Bird Bowls & Feeders
  '756de649-10e8-4092-8b12-fdc7867d3d76', -- Bird Cages
  '6fdb8b0a-d760-4a38-9b7d-01b5ad128ecd', -- Bird Houses
  '62463039-d8a8-4476-a35b-7bc2ebbf75cf', -- Bird Nests
  '704cb21f-003e-4e63-bbc4-2ba645ed1cfc', -- Bird Perches
  'e704e7ba-8092-4de0-88db-6cf06b544148', -- Bird Toys
  -- Fish children
  '0c12fdd9-ab9a-4c00-a44b-2ed5cfd226c1', -- Fish Tanks
  -- Reptile children
  '6b6299e3-0224-4f60-9d17-ab40833ded11', -- Reptile Lighting
  '2b578de4-6296-46d1-a60c-c4a3f21711bb', -- Reptile Terrariums
  -- Small Pets children
  'd1c84032-e7d1-4c5c-b3b3-f30c2146176d', -- Small Pet Accessories
  '31c1f8a2-c562-4748-97d0-a7c4b13e728c', -- Rabbit Hutches
  -- Small Pets sub-parents
  '88888888-0000-0000-0000-000000000008', -- Guinea Pigs
  '66666666-0000-0000-0000-000000000006', -- Hamsters
  '77777777-0000-0000-0000-000000000007', -- Rabbits
  -- Top-level parents
  '33333333-0000-0000-0000-000000000003', -- Birds
  '55555555-0000-0000-0000-000000000005', -- Fish & Aquarium
  '99999999-0000-0000-0000-000000000009', -- Reptiles
  '6633af04-be55-4f57-b64c-901299d8dc31'  -- Small Pets
);

-- Step 2: Delete grandchildren first (deepest level)
DELETE FROM categories WHERE id IN (
  'a088ed51-d583-46cc-8c66-57571c8d2183', -- Rabbit Cages
  '9d499ad9-048c-4210-a124-7066fcd64cda', -- Hamster Wheels
  'd2013111-8b64-4b77-a617-d421c0518f63', -- Guinea Pig Toys
  '599a97a1-c2a0-4e1d-a04e-a3bc130f7ac9', -- Hamster Cages
  '9adb48fb-b6f9-4196-bd1f-4a1f57c37a96'  -- Guinea Pig Cages
);

-- Step 3: Delete children (second level)
DELETE FROM categories WHERE id IN (
  'cc78b320-e249-409c-8749-8232d21bc656', -- Bird Accessories
  '173baa34-c498-4102-8147-d1f6267c97a1', -- Bird Bowls & Feeders
  '756de649-10e8-4092-8b12-fdc7867d3d76', -- Bird Cages
  '6fdb8b0a-d760-4a38-9b7d-01b5ad128ecd', -- Bird Houses
  '62463039-d8a8-4476-a35b-7bc2ebbf75cf', -- Bird Nests
  '704cb21f-003e-4e63-bbc4-2ba645ed1cfc', -- Bird Perches
  'e704e7ba-8092-4de0-88db-6cf06b544148', -- Bird Toys
  '0c12fdd9-ab9a-4c00-a44b-2ed5cfd226c1', -- Fish Tanks
  '6b6299e3-0224-4f60-9d17-ab40833ded11', -- Reptile Lighting
  '2b578de4-6296-46d1-a60c-c4a3f21711bb', -- Reptile Terrariums
  'd1c84032-e7d1-4c5c-b3b3-f30c2146176d', -- Small Pet Accessories
  '31c1f8a2-c562-4748-97d0-a7c4b13e728c', -- Rabbit Hutches
  '88888888-0000-0000-0000-000000000008', -- Guinea Pigs
  '66666666-0000-0000-0000-000000000006', -- Hamsters
  '77777777-0000-0000-0000-000000000007'  -- Rabbits
);

-- Step 4: Delete top-level empty parents
DELETE FROM categories WHERE id IN (
  '33333333-0000-0000-0000-000000000003', -- Birds
  '55555555-0000-0000-0000-000000000005', -- Fish & Aquarium
  '99999999-0000-0000-0000-000000000009', -- Reptiles
  '6633af04-be55-4f57-b64c-901299d8dc31'  -- Small Pets
);