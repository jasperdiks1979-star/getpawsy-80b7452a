-- GETPAWSY FULL FEED OPTIMIZATION MIGRATION

-- Step 1: Deactivate non-dog/cat products per catalog policy (birds, hamsters, reptiles, wall art, pest devices)
UPDATE products SET is_active = false WHERE id IN ('9690709c-4409-49ef-95c8-6b7253de90b3', '1c6ec0e8-a703-4f00-acbc-c5b2908593ef', '4c925c9b-43ef-43df-9b4d-e4e6f02e754c', '215a1964-324c-4e63-9b5f-b7cd4257c413', '795345a6-6391-4cd3-ae08-e7823dc4a983', 'f4a58135-9aae-4c2b-93f8-7e9a48225084', '7cb2dfcb-955b-4f7b-859c-172351c3084f', '1a24dcfe-139d-4278-8b45-f3419f308128', '33c1685a-bda2-469b-9c6d-087f3034706b', '9c8a51b9-bff6-440c-b31f-e03a964b640c', '55437c66-e849-49ad-b3e3-2cc66e576f5d', '5fbe1444-0287-4f83-ba82-3a2396e58bfc', '11ad4a14-5d71-483c-a6db-9df9d7c48b86', 'bc9bdea0-7285-463a-bdee-5ad48aed15b4', 'fcd6bda3-636e-466c-876d-e9e6812618bb');

-- Step 2: Fix missing google_product_category
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Feeding Supplies > Cat Water Bowls & Fountains' WHERE id = '5987be63-0e09-4d07-a6d1-2380fda9325d';
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Apparel & Accessories > Dog Sweaters & Hoodies' WHERE id = 'afc9ad61-c618-4718-a3d7-228d1b728122';
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture > Cat Trees' WHERE id = '5591787b-2d67-4916-94af-9d828b856447';
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Feeding & Watering Supplies > Dog Bowls & Dishes' WHERE id = 'ba5771b4-10d2-4866-97f4-4176c1e210f1';
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Toys' WHERE id = '24dbca64-88ba-4c15-b3a9-4b057ca5a5b7';
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Flea & Tick Supplies > Dog Flea & Tick Collars' WHERE id = '6598f55b-30fe-4481-8a42-4fc1baac109b';
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Beds' WHERE id = 'c572e0e4-0df9-45e4-8d37-f5a821dcdef1';

-- Step 3: Fix missing product_type
UPDATE products SET product_type = 'Pet Supplies > Cat Supplies > Feeding Supplies > Water Fountains' WHERE id = '5987be63-0e09-4d07-a6d1-2380fda9325d';
UPDATE products SET product_type = 'Pet Supplies > Dog Supplies > Clothing > Winter Apparel' WHERE id = 'afc9ad61-c618-4718-a3d7-228d1b728122';
UPDATE products SET product_type = 'Pet Supplies > Cat Supplies > Furniture > Wall-Mounted Cat Trees' WHERE id = '5591787b-2d67-4916-94af-9d828b856447';
UPDATE products SET product_type = 'Pet Supplies > Dog Supplies > Feeding Supplies > Slow Feeder Bowls' WHERE id = 'ba5771b4-10d2-4866-97f4-4176c1e210f1';
UPDATE products SET product_type = 'Pet Supplies > Cat Supplies > Toys > Catnip Sprays' WHERE id = '24dbca64-88ba-4c15-b3a9-4b057ca5a5b7';
UPDATE products SET product_type = 'Pet Supplies > Dog Supplies > Flea & Tick Supplies > Flea Collars' WHERE id = '6598f55b-30fe-4481-8a42-4fc1baac109b';
UPDATE products SET product_type = 'Pet Supplies > Dog Supplies > Beds & Furniture > Dog Beds' WHERE id = 'c572e0e4-0df9-45e4-8d37-f5a821dcdef1';

-- Step 4: Weight normalization for products with NULL weight
UPDATE products SET weight = 750 WHERE id = '5987be63-0e09-4d07-a6d1-2380fda9325d' AND weight IS NULL;
UPDATE products SET weight = 900 WHERE id = 'dcc0a412-adfe-49b3-8f26-ad8382f3a2d9' AND weight IS NULL;
UPDATE products SET weight = 800 WHERE id = '685f7faf-7809-4962-b408-c2ced99dd178' AND weight IS NULL;
UPDATE products SET weight = 400 WHERE id = '1d2d5bb1-36d5-4c76-a426-298abf0755d6' AND weight IS NULL;
UPDATE products SET weight = 700 WHERE id = 'd2482798-f8c2-4096-b568-f366365b5a2e' AND weight IS NULL;
UPDATE products SET weight = 200 WHERE id = 'afc9ad61-c618-4718-a3d7-228d1b728122' AND weight IS NULL;
UPDATE products SET weight = 5000 WHERE id = '5591787b-2d67-4916-94af-9d828b856447' AND weight IS NULL;
UPDATE products SET weight = 1200 WHERE id = '0b041496-f7a3-480c-83bb-fdba8ae840f3' AND weight IS NULL;
UPDATE products SET weight = 3500 WHERE id = '74e9c23c-d2d3-478a-82bd-e912e85bcc39' AND weight IS NULL;
UPDATE products SET weight = 2500 WHERE id = 'e265e7fe-af60-4efc-b927-5c4f79fc1bf0' AND weight IS NULL;
UPDATE products SET weight = 2800 WHERE id = '32e50b79-e2bc-4895-a7c2-5534dd9095a0' AND weight IS NULL;
UPDATE products SET weight = 3000 WHERE id = '156ed3db-e926-482c-951a-4c1fcb61779d' AND weight IS NULL;
UPDATE products SET weight = 50 WHERE id = '64b2bb00-2064-4992-9c06-bdc263421dc3' AND weight IS NULL;
UPDATE products SET weight = 150 WHERE id = 'd7baf590-affa-403f-ba96-58b298ba652d' AND weight IS NULL;
UPDATE products SET weight = 250 WHERE id = '33ad17c0-b009-4df5-8e45-265fcb78bdbc' AND weight IS NULL;
UPDATE products SET weight = 300 WHERE id = 'ba5771b4-10d2-4866-97f4-4176c1e210f1' AND weight IS NULL;
UPDATE products SET weight = 350 WHERE id = '6555456c-cb10-44c3-9a3c-0703bef6bc10' AND weight IS NULL;
UPDATE products SET weight = 800 WHERE id = '294c6051-b66d-4c83-a2c9-e2720b64694e' AND weight IS NULL;
UPDATE products SET weight = 80 WHERE id = '1338e81b-5de4-4e47-8f95-ad6bb69c3b4c' AND weight IS NULL;
UPDATE products SET weight = 100 WHERE id = '24dbca64-88ba-4c15-b3a9-4b057ca5a5b7' AND weight IS NULL;
UPDATE products SET weight = 200 WHERE id = '12a3f51c-5872-4544-a690-43cbbc8fb5f0' AND weight IS NULL;
UPDATE products SET weight = 120 WHERE id = '42eddd95-6d8f-438c-a8ff-c1b320ccdd76' AND weight IS NULL;
UPDATE products SET weight = 200 WHERE id = '1aff8014-ce29-4232-82a7-3c94d44f1e8e' AND weight IS NULL;
UPDATE products SET weight = 150 WHERE id = '51d08cc0-d431-4121-a409-6f21c57a9d03' AND weight IS NULL;
UPDATE products SET weight = 600 WHERE id = '10ba8425-750b-44b7-90e3-167c6736bdac' AND weight IS NULL;
UPDATE products SET weight = 1200 WHERE id = 'c572e0e4-0df9-45e4-8d37-f5a821dcdef1' AND weight IS NULL;
UPDATE products SET weight = 80 WHERE id = '6598f55b-30fe-4481-8a42-4fc1baac109b' AND weight IS NULL;
UPDATE products SET weight = 250 WHERE id = '2b61b25d-75a2-4fec-a1fd-8b7de3b916cb' AND weight IS NULL;
UPDATE products SET weight = 8000 WHERE id = '5b2f4dd7-1484-41ef-a41e-33eedec21a57' AND weight IS NULL;

-- Step 5: Title optimization for unoptimized products
UPDATE products SET name = 'Cat Water Fountain 4L – Stainless Steel Automatic Dispenser with LED Light', original_name = COALESCE(original_name, name) WHERE id = '5987be63-0e09-4d07-a6d1-2380fda9325d';
UPDATE products SET name = 'Dog Winter Hood – Adjustable Warm Fleece Cover for Cold Weather', original_name = COALESCE(original_name, name) WHERE id = 'afc9ad61-c618-4718-a3d7-228d1b728122';
UPDATE products SET name = 'Wall-Mounted Cat Climbing Frame – Modular DIY Cat Tree with Shelves & Perches', original_name = COALESCE(original_name, name) WHERE id = '5591787b-2d67-4916-94af-9d828b856447';
UPDATE products SET name = 'Dog Slow Feeder Bowl – Non-Slip Licking Plate for Enrichment & Anxiety Relief', original_name = COALESCE(original_name, name) WHERE id = 'ba5771b4-10d2-4866-97f4-4176c1e210f1';
UPDATE products SET name = 'Catnip Spray for Cats – Long-Lasting Interactive Enrichment Spray', original_name = COALESCE(original_name, name) WHERE id = '24dbca64-88ba-4c15-b3a9-4b057ca5a5b7';
UPDATE products SET name = 'Dog Flea & Tick Collar – Adjustable Prevention Collar for Dogs', original_name = COALESCE(original_name, name) WHERE id = '6598f55b-30fe-4481-8a42-4fc1baac109b';
UPDATE products SET name = 'Dog Bed – Warm Plaid Cushion with PP Cotton Fill for Medium & Large Dogs', original_name = COALESCE(original_name, name) WHERE id = 'c572e0e4-0df9-45e4-8d37-f5a821dcdef1';
UPDATE products SET name = 'Stainless Steel Cat Litter Box – Extra Large with Flip Cover for Big Cats', original_name = COALESCE(original_name, name) WHERE id = '74e9c23c-d2d3-478a-82bd-e912e85bcc39';
UPDATE products SET name = 'Dog Leash – High-Density Nylon Outdoor Walking Lead for Dogs', original_name = COALESCE(original_name, name) WHERE id = 'd7baf590-affa-403f-ba96-58b298ba652d';
UPDATE products SET name = 'Dog & Cat Bandana Collar – Double Layer Plaid Bib Style Collar', original_name = COALESCE(original_name, name) WHERE id = '64b2bb00-2064-4992-9c06-bdc263421dc3';
UPDATE products SET name = 'Dog Puzzle Bowl – Slow Feeding Enrichment Mat for Mental Stimulation', original_name = COALESCE(original_name, name) WHERE id = '6555456c-cb10-44c3-9a3c-0703bef6bc10';
UPDATE products SET name = 'Cat Water Fountain – 304 Stainless Steel Automatic Dispenser for Cats', original_name = COALESCE(original_name, name) WHERE id = 'd2482798-f8c2-4096-b568-f366365b5a2e';
UPDATE products SET name = 'Raised Dog Bowl Stand – Adjustable Double Feeder with Slow Eating Design', original_name = COALESCE(original_name, name) WHERE id = '294c6051-b66d-4c83-a2c9-e2720b64694e';
UPDATE products SET name = 'Pet Cleaning Wipes – Gentle Grooming Wipes for Dogs & Cats', original_name = COALESCE(original_name, name) WHERE id = '1aff8014-ce29-4232-82a7-3c94d44f1e8e';
UPDATE products SET name = 'Dog Paw Balm – Moisturizing Paw Pad Protector for Dry & Cracked Paws', original_name = COALESCE(original_name, name) WHERE id = '42eddd95-6d8f-438c-a8ff-c1b320ccdd76';
UPDATE products SET name = 'Pet Wound Care Spray – Skin Moisturizer & Fur Cleaner for Dogs & Cats', original_name = COALESCE(original_name, name) WHERE id = '51d08cc0-d431-4121-a409-6f21c57a9d03';
UPDATE products SET name = 'Cat Wall Perch – Wooden Mounted Climbing Shelf for Indoor Cats', original_name = COALESCE(original_name, name) WHERE id = '0b041496-f7a3-480c-83bb-fdba8ae840f3';
UPDATE products SET name = 'Portable Dog Water Bottle – Squeeze Dispenser for Travel & Walks', original_name = COALESCE(original_name, name) WHERE id = '2b61b25d-75a2-4fec-a1fd-8b7de3b916cb';
UPDATE products SET name = 'Interactive Cat Teaser Wand – Reflective Feather Toy for Indoor Play', original_name = COALESCE(original_name, name) WHERE id = '1338e81b-5de4-4e47-8f95-ad6bb69c3b4c';
UPDATE products SET name = 'Enclosed Pet Bed – Warm Sleeping Bag for Cats & Small Dogs', original_name = COALESCE(original_name, name) WHERE id = '10ba8425-750b-44b7-90e3-167c6736bdac';

-- Step 6: Fix category mismatches
UPDATE products SET category = 'Pet Grooming' WHERE id = '12a3f51c-5872-4544-a690-43cbbc8fb5f0';
UPDATE products SET category = 'Cat Beds' WHERE id = '10ba8425-750b-44b7-90e3-167c6736bdac';
UPDATE products SET category = 'Cat Trees & Condos' WHERE id = '0b041496-f7a3-480c-83bb-fdba8ae840f3';

-- Step 7: Strip HTML from ALL descriptions that still contain HTML tags
UPDATE products 
SET description = regexp_replace(
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(description, '<[^>]+>', ' ', 'g'),
              '&nbsp;', ' ', 'g'),
            '&amp;', '&', 'g'),
          '&lt;', '<', 'g'),
        '&gt;', '>', 'g'),
      '\*([^*]+)\*', '\1', 'g'),
    '\s+', ' ', 'g'),
  '^\s+|\s+$', '', 'g')
WHERE description ~ '<[a-zA-Z/]' AND is_active = true;

-- Step 8: Set shopping_title = name for all products
UPDATE products SET shopping_title = name WHERE is_active = true AND is_duplicate = false;

-- Step 9: Fix null animal_type based on category
UPDATE products SET animal_type = 'Dog' 
WHERE animal_type IS NULL AND is_active = true 
AND (category ILIKE '%dog%');

UPDATE products SET animal_type = 'Cat' 
WHERE animal_type IS NULL AND is_active = true 
AND (category ILIKE '%cat%');

-- Step 10: Ensure brand = 'GetPawsy' for all active products
UPDATE products SET brand = 'GetPawsy' WHERE is_active = true AND (brand IS NULL OR brand = '');

-- Step 11: Auto-fix remaining null google_product_category based on category
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Beds' WHERE category = 'Dog Beds' AND (google_product_category IS NULL OR google_product_category = '') AND is_active = true;
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Collars & Harnesses' WHERE category = 'Dog Collars & Leashes' AND (google_product_category IS NULL OR google_product_category = '') AND is_active = true;
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Carriers & Travel Products' WHERE category = 'Dog Carriers' AND (google_product_category IS NULL OR google_product_category = '') AND is_active = true;
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Apparel & Accessories' WHERE category = 'Dog Clothing' AND (google_product_category IS NULL OR google_product_category = '') AND is_active = true;
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Feeding & Watering Supplies' WHERE category = 'Dog Bowls & Feeders' AND (google_product_category IS NULL OR google_product_category = '') AND is_active = true;
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Feeding & Watering Supplies' WHERE category = 'Dog Feeding Supplies' AND (google_product_category IS NULL OR google_product_category = '') AND is_active = true;
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Grooming Supplies' WHERE category = 'Dog Grooming' AND (google_product_category IS NULL OR google_product_category = '') AND is_active = true;
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Training Supplies' WHERE category = 'Dog Training' AND (google_product_category IS NULL OR google_product_category = '') AND is_active = true;
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture > Cat Trees' WHERE category = 'Cat Trees & Condos' AND (google_product_category IS NULL OR google_product_category = '') AND is_active = true;
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Beds' WHERE category = 'Cat Beds' AND (google_product_category IS NULL OR google_product_category = '') AND is_active = true;
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Litter & Housebreaking > Cat Litter Boxes' WHERE category = 'Cat Litter Boxes' AND (google_product_category IS NULL OR google_product_category = '') AND is_active = true;
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Feeding Supplies' WHERE category = 'Cat Bowls & Feeders' AND (google_product_category IS NULL OR google_product_category = '') AND is_active = true;
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Toys' WHERE category = 'Cat Toys' AND (google_product_category IS NULL OR google_product_category = '') AND is_active = true;
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Carriers' WHERE category = 'Cat Carriers' AND (google_product_category IS NULL OR google_product_category = '') AND is_active = true;
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture' WHERE category = 'Cat Furniture' AND (google_product_category IS NULL OR google_product_category = '') AND is_active = true;
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Pet Grooming Supplies' WHERE category = 'Pet Grooming' AND (google_product_category IS NULL OR google_product_category = '') AND is_active = true;
UPDATE products SET google_product_category = 'Animals & Pet Supplies > Pet Supplies > Pet Feeding Supplies' WHERE category = 'Pet Feeding Supplies' AND (google_product_category IS NULL OR google_product_category = '') AND is_active = true;

-- Step 12: Default weights for any remaining NULL weights by category
UPDATE products SET weight = 500 WHERE weight IS NULL AND is_active = true AND category ILIKE '%toy%';
UPDATE products SET weight = 200 WHERE weight IS NULL AND is_active = true AND category ILIKE '%collar%';
UPDATE products SET weight = 200 WHERE weight IS NULL AND is_active = true AND category ILIKE '%leash%';
UPDATE products SET weight = 300 WHERE weight IS NULL AND is_active = true AND category ILIKE '%groom%';
UPDATE products SET weight = 1500 WHERE weight IS NULL AND is_active = true AND category ILIKE '%bed%';
UPDATE products SET weight = 8000 WHERE weight IS NULL AND is_active = true AND category ILIKE '%tree%';
UPDATE products SET weight = 3000 WHERE weight IS NULL AND is_active = true AND category ILIKE '%litter%';
UPDATE products SET weight = 700 WHERE weight IS NULL AND is_active = true AND category ILIKE '%bowl%';
UPDATE products SET weight = 700 WHERE weight IS NULL AND is_active = true AND category ILIKE '%feed%';
UPDATE products SET weight = 500 WHERE weight IS NULL AND is_active = true;