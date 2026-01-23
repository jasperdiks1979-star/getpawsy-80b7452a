import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Keywords that should EXCLUDE a product from certain categories
const EXCLUSION_KEYWORDS = {
  // Products with these keywords should NOT be in dog/cat categories
  'not-dog-cat': [
    'ferret', 'chinchilla', 'guinea pig', 'hamster', 'rabbit', 'bunny', 
    'bird', 'parrot', 'fish', 'aquarium', 'reptile', 'turtle', 'snake',
    'chicken', 'duck', 'small animal', 'rodent', 'gerbil', 'mouse', 'rat'
  ],
};

// Diersoort-specifieke keyword map - UPDATED with correct slugs matching database
const CATEGORY_KEYWORD_MAP: Record<string, string[]> = {
  // DOG categories
  'dog-beds': ['dog bed', 'puppy bed', 'canine bed', 'dog mattress', 'dog cushion', 'doggy bed', 'orthopedic dog', 'dog sleeping'],
  'dog-toys': ['dog toy', 'puppy toy', 'canine toy', 'chew toy', 'fetch toy', 'rope toy dog', 'squeaky dog', 'dog ball', 'dog frisbee', 'tug toy'],
  'dog-food-treats': ['dog food', 'dog treat', 'puppy food', 'canine food', 'dog snack', 'dog biscuit', 'dog chew', 'omega dog', 'fish oil dog'],
  'dog-collars-leashes': ['dog collar', 'dog leash', 'dog harness', 'puppy collar', 'canine leash', 'dog lead', 'walking dog', 'bark collar', 'anti bark'],
  'dog-bowls-feeders': ['dog bowl', 'dog feeder', 'puppy bowl', 'canine bowl', 'dog food bowl', 'dog water bowl', 'slow feeder dog'],
  'dog-grooming': ['dog brush', 'dog shampoo', 'dog grooming', 'puppy grooming', 'dog nail', 'dog comb', 'deshedding dog', 'pet wipes dog'],
  'dog-carriers': ['dog carrier', 'dog crate', 'puppy carrier', 'dog transport', 'dog travel bag', 'dog backpack carrier', 'dog stroller', 'pet stroller'],
  'dog-clothing': ['dog clothes', 'dog sweater', 'dog coat', 'dog jacket', 'puppy clothes', 'dog costume', 'dog raincoat', 'dog hoodie'],
  'dog-houses': ['dog house', 'dog kennel outdoor', 'puppy house', 'outdoor dog', 'dog shelter'],
  'dog-training': ['dog training', 'puppy training', 'dog whistle', 'clicker dog', 'training treat', 'potty training dog', 'potty pad', 'pee pad', 'dog potty', 'artificial grass dog'],
  
  // CAT categories
  'cat-beds': ['cat bed', 'kitten bed', 'feline bed', 'cat cushion', 'cat mattress', 'cat sleeping', 'cozy cat', 'fluffy cat bed', 'faux fur cat bed'],
  'cat-toys': ['cat toy', 'kitten toy', 'feline toy', 'catnip', 'cat wand', 'laser cat', 'mouse toy cat', 'feather toy cat', 'cat ball', 'interactive cat', 'cat tunnel'],
  'cat-food-treats': ['cat food', 'cat treat', 'kitten food', 'feline food', 'cat snack'],
  'cat-collars-accessories': ['cat collar', 'cat harness', 'kitten collar', 'cat leash', 'cat bell'],
  'cat-bowls-feeders': ['cat bowl', 'cat feeder', 'kitten bowl', 'cat fountain', 'cat water', 'slow feeder cat', 'pet fountain cat'],
  'cat-grooming': ['cat brush', 'cat comb', 'cat grooming', 'cat nail', 'cat shampoo', 'deshedding cat', 'cat steam brush', 'steamy brush cat'],
  'cat-carriers': ['cat carrier', 'cat crate', 'kitten carrier', 'cat transport', 'cat travel', 'cat backpack', 'cat stroller'],
  'cat-litter-boxes': ['litter box', 'cat litter', 'litter tray', 'litter scoop', 'cat toilet', 'self cleaning litter', 'automatic litter'],
  'cat-scratching-posts': ['scratching post', 'cat scratcher', 'scratch pad', 'sisal cat', 'cardboard scratcher', 'scratch furniture'],
  'cat-trees-and-condos': ['cat tree', 'cat tower', 'cat condo', 'climbing cat', 'cat perch tower', 'cat climbing tower', 'multi level cat', 'multi-level cat'],
  'cat-furniture': ['cat furniture', 'cat shelf wall', 'wall mounted cat shelf', 'cat window perch', 'cat bridge'],
  'cat-hammocks': ['cat hammock', 'hanging cat bed', 'cat swing bed', 'suspended cat', 'window hammock cat'],
  'cat-houses': ['cat house', 'cat cave', 'cat tent', 'cat igloo', 'outdoor cat house', 'heated cat'],
  
  // BIRD categories - NOTE: use bird-bowls-feeders not bird-feeders (matches database)
  'bird-cages': ['bird cage', 'birdcage', 'parrot cage', 'parakeet cage', 'canary cage', 'finch cage', 'aviary', 'flight cage', 'budgie cage'],
  'bird-toys': ['bird toy', 'parrot toy', 'bird swing', 'bird ladder', 'bird bell', 'bird mirror', 'foraging toy bird', 'bird playground', 't-bracket bird'],
  'bird-bowls-feeders': ['bird feeder', 'bird bowl', 'bird waterer', 'seed cup', 'bird dish', 'hummingbird feeder', 'wild bird feeder', 'solar bird feeder', 'smart bird feeder', 'bird bath', 'bird feeder pole'],
  'bird-perches': ['bird perch', 'parrot perch', 'natural perch', 'rope perch', 'bird stand', 'bird training perch'],
  'bird-nests': ['bird nest', 'nesting box', 'breeding box', 'bird house', 'birdhouse'],
  
  // HAMSTER categories - includes ferret/chinchilla since they use similar caging
  'hamster-cages': ['hamster cage', 'hamster habitat', 'hamster tank', 'hamster enclosure', 'dwarf hamster cage',
    'ferret cage', 'ferret enclosure', 'chinchilla cage', 'chinchilla enclosure', 'small animal cage',
    'rat cage', 'mouse cage', 'gerbil cage', 'small pet cage', 'multi-level small animal'],
  'hamster-wheels': ['hamster wheel', 'exercise wheel', 'running wheel', 'silent wheel', 'flying saucer wheel', 'hamster ball'],
  
  // RABBIT categories
  'rabbit-cages': ['rabbit cage', 'rabbit hutch', 'bunny cage', 'rabbit enclosure', 'rabbit pen', 'chicken coop small', 'duck house'],
  
  // GUINEA PIG categories
  'guinea-pig-cages': ['guinea pig cage', 'guinea pig habitat', 'cavy cage', 'c&c cage', 'guinea pig enclosure', 'guinea pig hutch'],
  
  // REPTILE categories
  'reptile-terrariums': ['terrarium', 'reptile tank', 'vivarium', 'reptile enclosure', 'snake tank', 'gecko tank', 'turtle tank', 'tortoise enclosure', 'turtle aquarium', 'turtle kit'],
  'reptile-lighting': ['uvb light reptile', 'reptile light', 'basking light', 'reptile bulb', 'uvb lamp', 'heat lamp reptile'],
  
  // FISH categories
  'fish-tanks': ['fish tank', 'aquarium', 'fish bowl', 'nano tank', 'betta tank', 'reef tank'],
  
  // GENERIC PET (for multi-species products)
  'pet-houses': ['pet tent', 'pet playpen', 'portable pet', 'foldable pet tent', 'pet exercise pen'],
};

// Generieke keywords die naar hoofdcategorieën verwijzen
const MAIN_CATEGORY_KEYWORDS: Record<string, string[]> = {
  'dogs': ['dog', 'puppy', 'canine', 'pup', 'doggy', 'doggie', 'pooch', 'hound', 'k9', 'k-9'],
  'cats': ['cat', 'kitten', 'feline', 'kitty', 'kitties'],
  'birds': ['bird', 'parrot', 'parakeet', 'budgie', 'cockatiel', 'canary', 'finch', 'lovebird', 'cockatoo', 'macaw', 'conure', 'aviary'],
  'hamsters': ['hamster', 'dwarf hamster', 'syrian hamster', 'robo hamster', 'roborovski', 'ferret', 'chinchilla', 'gerbil', 'mouse', 'rat', 'small animal', 'rodent'],
  'rabbits': ['rabbit', 'bunny', 'bunnies', 'hare', 'lop'],
  'guinea-pigs': ['guinea pig', 'cavy', 'cavies'],
  'reptiles': ['reptile', 'snake', 'lizard', 'gecko', 'bearded dragon', 'turtle', 'tortoise', 'chameleon', 'iguana', 'python', 'boa'],
  'fish-aquarium': ['fish', 'aquarium', 'aquatic', 'betta', 'goldfish', 'tropical fish', 'reef', 'marine'],
};

// Product type keywords
const PRODUCT_TYPE_KEYWORDS: Record<string, string[]> = {
  'beds': ['bed', 'cushion', 'mattress', 'sleeping', 'nest', 'donut', 'bolster', 'orthopedic', 'memory foam', 'plush bed'],
  'toys': ['toy', 'play', 'chew', 'squeaky', 'interactive', 'puzzle', 'ball', 'rope', 'plush toy', 'stuffed'],
  'food-treats': ['food', 'treat', 'snack', 'biscuit', 'nutrition', 'diet', 'kibble', 'meal'],
  'bowls-feeders': ['bowl', 'feeder', 'dish', 'fountain', 'waterer', 'slow feed', 'elevated', 'automatic feeder'],
  'grooming': ['brush', 'comb', 'grooming', 'shampoo', 'nail', 'trimmer', 'deshedding', 'fur', 'coat care'],
  'carriers': ['carrier', 'crate', 'transport', 'travel', 'backpack', 'bag', 'airline'],
  'collars-leashes': ['collar', 'leash', 'harness', 'lead', 'walking', 'tag', 'id'],
  'houses': ['house', 'kennel', 'shelter', 'cave', 'hideout', 'hut', 'igloo', 'tent'],
  'clothing': ['clothes', 'sweater', 'coat', 'jacket', 'costume', 'outfit', 'dress', 'hoodie', 'raincoat'],
  'furniture': ['furniture', 'tree', 'tower', 'condo', 'shelf', 'perch', 'bridge', 'climbing'],
  'scratching': ['scratching', 'scratcher', 'scratch pad', 'sisal'],
  'litter': ['litter', 'toilet', 'potty', 'scoop'],
  'cages': ['cage', 'enclosure', 'habitat', 'pen', 'hutch', 'tank', 'vivarium', 'terrarium'],
  'accessories': ['accessory', 'supplies', 'gear', 'equipment'],
};

interface RecategorizationResult {
  productId: string;
  productName: string;
  oldCategory: string | null;
  newCategory: string;
  matchScore: number;
  matchedKeywords: string[];
}

function determineCategory(name: string, description: string | null): { category: string; score: number; keywords: string[] } {
  const text = `${name} ${description || ''}`.toLowerCase();
  
  let bestMatch = { category: 'dogs', score: 0, keywords: [] as string[] };
  
  // First, try to match specific subcategories
  for (const [categorySlug, keywords] of Object.entries(CATEGORY_KEYWORD_MAP)) {
    let matchCount = 0;
    const matchedKeywords: string[] = [];
    
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        matchCount += keyword.split(' ').length; // Multi-word matches count more
        matchedKeywords.push(keyword);
      }
    }
    
    if (matchCount > bestMatch.score) {
      bestMatch = { category: categorySlug, score: matchCount, keywords: matchedKeywords };
    }
  }
  
  // If we found a good subcategory match, return it
  if (bestMatch.score >= 2) {
    return bestMatch;
  }
  
  // Otherwise, try to determine animal type + product type combination
  let detectedAnimal: string | null = null;
  let animalScore = 0;
  
  for (const [animal, keywords] of Object.entries(MAIN_CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        const score = keyword.split(' ').length;
        if (score > animalScore) {
          detectedAnimal = animal;
          animalScore = score;
        }
      }
    }
  }
  
  let detectedProductType: string | null = null;
  let productScore = 0;
  
  for (const [productType, keywords] of Object.entries(PRODUCT_TYPE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        const score = keyword.split(' ').length;
        if (score > productScore) {
          detectedProductType = productType;
          productScore = score;
        }
      }
    }
  }
  
  // Construct the category slug
  if (detectedAnimal && detectedProductType) {
    const animalPrefix = detectedAnimal === 'fish-aquarium' ? 'fish' : 
                         detectedAnimal === 'guinea-pigs' ? 'guinea-pig' :
                         detectedAnimal.replace(/-/g, '').replace(/s$/, '');
    
    const categorySlug = `${animalPrefix}-${detectedProductType}`;
    
    // Check if this category exists in our map
    if (CATEGORY_KEYWORD_MAP[categorySlug]) {
      return { category: categorySlug, score: animalScore + productScore, keywords: [detectedAnimal, detectedProductType] };
    }
    
    // Fall back to a valid subcategory for this animal
    const validCategories = Object.keys(CATEGORY_KEYWORD_MAP).filter(c => c.startsWith(animalPrefix));
    if (validCategories.length > 0) {
      return { category: validCategories[0], score: animalScore, keywords: [detectedAnimal] };
    }
  }
  
  // Fall back to detected animal's first subcategory or dogs
  if (detectedAnimal) {
    const animalPrefix = detectedAnimal === 'fish-aquarium' ? 'fish' : 
                         detectedAnimal === 'guinea-pigs' ? 'guinea-pig' :
                         detectedAnimal.replace(/-/g, '').replace(/s$/, '');
    
    const validCategories = Object.keys(CATEGORY_KEYWORD_MAP).filter(c => c.startsWith(animalPrefix));
    if (validCategories.length > 0) {
      return { category: validCategories[0], score: animalScore, keywords: [detectedAnimal] };
    }
  }
  
  // Ultimate fallback
  return { category: 'dog-accessories', score: 0, keywords: [] };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { dryRun = true, limit = 100 } = await req.json().catch(() => ({ dryRun: true, limit: 100 }));

    // Fetch products
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, name, description, category")
      .eq("is_active", true)
      .limit(limit);

    if (productsError) throw productsError;

    // Fetch categories for validation
    const { data: categories, error: categoriesError } = await supabase
      .from("categories")
      .select("id, slug, parent_id");

    if (categoriesError) throw categoriesError;

    const categoryMap = new Map(categories.map(c => [c.slug, c]));

    const results: RecategorizationResult[] = [];
    const updates: { id: string; category: string }[] = [];

    for (const product of products || []) {
      const { category: newCategory, score, keywords } = determineCategory(
        product.name,
        product.description
      );

      // Only include if category changed and new category exists
      if (product.category !== newCategory && categoryMap.has(newCategory)) {
        results.push({
          productId: product.id,
          productName: product.name,
          oldCategory: product.category,
          newCategory,
          matchScore: score,
          matchedKeywords: keywords,
        });
        updates.push({ id: product.id, category: newCategory });
      }
    }

    // Apply updates if not dry run
    if (!dryRun && updates.length > 0) {
      // Update in batches of 50
      for (let i = 0; i < updates.length; i += 50) {
        const batch = updates.slice(i, i + 50);
        
        for (const update of batch) {
          const { error: updateError } = await supabase
            .from("products")
            .update({ category: update.category })
            .eq("id", update.id);

          if (updateError) {
            console.error(`Failed to update product ${update.id}:`, updateError);
          }

          // Also update product_categories junction table
          const categoryData = categoryMap.get(update.category);
          if (categoryData) {
            // Delete existing category links
            await supabase
              .from("product_categories")
              .delete()
              .eq("product_id", update.id);

            // Insert new category link
            await supabase
              .from("product_categories")
              .insert({
                product_id: update.id,
                category_id: categoryData.id,
              });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dryRun,
        totalProducts: products?.length || 0,
        changesFound: results.length,
        changes: results.slice(0, 100), // Limit response size
        message: dryRun
          ? `Dry run complete. ${results.length} products would be recategorized.`
          : `Applied ${results.length} category changes.`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
