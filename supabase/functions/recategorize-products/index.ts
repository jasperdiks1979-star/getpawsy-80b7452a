import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Diersoort-specifieke keyword map
const CATEGORY_KEYWORD_MAP: Record<string, string[]> = {
  // DOG categories
  'dog-beds': ['dog bed', 'puppy bed', 'canine bed', 'dog mattress', 'dog cushion', 'doggy bed', 'orthopedic dog', 'dog sleeping'],
  'dog-toys': ['dog toy', 'puppy toy', 'canine toy', 'chew toy', 'fetch toy', 'rope toy dog', 'squeaky dog', 'dog ball', 'dog frisbee', 'tug toy'],
  'dog-food-treats': ['dog food', 'dog treat', 'puppy food', 'canine food', 'dog snack', 'dog biscuit', 'dog chew'],
  'dog-collars-leashes': ['dog collar', 'dog leash', 'dog harness', 'puppy collar', 'canine leash', 'dog lead', 'walking dog'],
  'dog-bowls-feeders': ['dog bowl', 'dog feeder', 'puppy bowl', 'canine bowl', 'dog food bowl', 'dog water bowl', 'slow feeder dog'],
  'dog-grooming': ['dog brush', 'dog shampoo', 'dog grooming', 'puppy grooming', 'dog nail', 'dog comb', 'deshedding dog'],
  'dog-carriers': ['dog carrier', 'dog crate', 'puppy carrier', 'dog transport', 'dog travel bag', 'dog backpack carrier'],
  'dog-clothing': ['dog clothes', 'dog sweater', 'dog coat', 'dog jacket', 'puppy clothes', 'dog costume', 'dog raincoat', 'dog hoodie'],
  'dog-houses': ['dog house', 'dog kennel', 'puppy house', 'outdoor dog', 'dog shelter'],
  'dog-training': ['dog training', 'puppy training', 'dog whistle', 'clicker dog', 'training treat', 'potty training dog'],
  'dog-health': ['dog vitamin', 'dog supplement', 'dog medicine', 'flea dog', 'tick dog', 'dog dental'],
  
  // CAT categories
  'cat-beds': ['cat bed', 'kitten bed', 'feline bed', 'cat cushion', 'cat mattress', 'cat sleeping', 'cozy cat'],
  'cat-toys': ['cat toy', 'kitten toy', 'feline toy', 'catnip', 'cat wand', 'laser cat', 'mouse toy cat', 'feather toy cat', 'cat ball', 'interactive cat'],
  'cat-food-treats': ['cat food', 'cat treat', 'kitten food', 'feline food', 'cat snack'],
  'cat-collars-accessories': ['cat collar', 'cat harness', 'kitten collar', 'cat leash', 'cat bell'],
  'cat-bowls-feeders': ['cat bowl', 'cat feeder', 'kitten bowl', 'cat fountain', 'cat water', 'slow feeder cat'],
  'cat-grooming': ['cat brush', 'cat comb', 'cat grooming', 'cat nail', 'cat shampoo', 'deshedding cat'],
  'cat-carriers': ['cat carrier', 'cat crate', 'kitten carrier', 'cat transport', 'cat travel', 'cat backpack'],
  'cat-litter-boxes': ['litter box', 'cat litter', 'litter tray', 'litter scoop', 'cat toilet', 'self cleaning litter'],
  'cat-scratching-posts': ['scratching post', 'cat scratcher', 'scratch pad', 'sisal cat', 'cardboard scratcher'],
  'cat-trees-and-condos': ['cat tree', 'cat tower', 'cat condo', 'climbing cat', 'cat perch', 'cat shelf', 'wall mounted cat'],
  'cat-furniture': ['cat furniture', 'cat shelf', 'cat window', 'cat hammock window', 'cat bridge'],
  'cat-hammocks': ['cat hammock', 'hanging cat bed', 'cat swing bed', 'suspended cat'],
  'cat-houses': ['cat house', 'cat cave', 'cat tent', 'cat igloo', 'outdoor cat house', 'heated cat'],
  
  // BIRD categories
  'bird-cages': ['bird cage', 'birdcage', 'parrot cage', 'parakeet cage', 'canary cage', 'finch cage', 'aviary'],
  'bird-toys': ['bird toy', 'parrot toy', 'bird swing', 'bird ladder', 'bird bell', 'bird mirror', 'foraging toy bird'],
  'bird-food-treats': ['bird food', 'bird seed', 'parrot food', 'bird treat', 'millet', 'bird pellet'],
  'bird-perches': ['bird perch', 'parrot perch', 'natural perch', 'rope perch', 'bird stand'],
  'bird-bowls-feeders': ['bird feeder', 'bird bowl', 'bird waterer', 'seed cup', 'bird dish'],
  'bird-nests': ['bird nest', 'nesting box', 'breeding box', 'bird house nest'],
  'bird-accessories': ['bird bath', 'cuttlebone', 'bird vitamin', 'bird harness', 'bird diaper'],
  'bird-supplies': ['bird supply', 'cage liner', 'bird litter', 'bird bedding'],
  
  // FISH categories
  'fish-tanks': ['fish tank', 'aquarium', 'fish bowl', 'nano tank', 'betta tank', 'reef tank'],
  'fish-food': ['fish food', 'fish flake', 'fish pellet', 'betta food', 'tropical fish food', 'goldfish food'],
  'fish-decorations': ['aquarium decoration', 'fish tank decor', 'aquarium plant', 'fish ornament', 'aquarium rock', 'driftwood'],
  'fish-filters': ['aquarium filter', 'fish filter', 'tank filter', 'sponge filter', 'canister filter', 'hang on back'],
  'fish-lighting': ['aquarium light', 'fish tank light', 'led aquarium', 'planted tank light'],
  'fish-heaters': ['aquarium heater', 'fish tank heater', 'submersible heater', 'aquarium thermometer'],
  'fish-accessories': ['air pump', 'bubble stone', 'fish net', 'gravel vacuum', 'water conditioner', 'test kit'],
  
  // HAMSTER categories
  'hamster-cages': ['hamster cage', 'hamster habitat', 'hamster tank', 'hamster enclosure', 'dwarf hamster cage'],
  'hamster-wheels': ['hamster wheel', 'exercise wheel', 'running wheel', 'silent wheel', 'flying saucer wheel'],
  'hamster-food': ['hamster food', 'hamster treat', 'hamster mix', 'hamster seed'],
  'hamster-bedding': ['hamster bedding', 'paper bedding', 'aspen bedding', 'hamster substrate'],
  'hamster-toys': ['hamster toy', 'hamster tunnel', 'hamster tube', 'hamster ball', 'chew toy hamster'],
  'hamster-houses': ['hamster house', 'hamster hideout', 'hamster hut', 'hamster igloo'],
  'hamster-accessories': ['hamster bottle', 'hamster bowl', 'hamster sand bath', 'hamster carrier'],
  
  // RABBIT categories
  'rabbit-cages': ['rabbit cage', 'rabbit hutch', 'bunny cage', 'rabbit enclosure', 'rabbit pen'],
  'rabbit-food': ['rabbit food', 'rabbit pellet', 'timothy hay', 'rabbit treat', 'bunny food'],
  'rabbit-toys': ['rabbit toy', 'bunny toy', 'rabbit chew', 'rabbit tunnel', 'rabbit ball'],
  'rabbit-houses': ['rabbit house', 'rabbit hideout', 'bunny house', 'rabbit shelter'],
  'rabbit-bedding': ['rabbit bedding', 'rabbit litter', 'rabbit hay'],
  'rabbit-accessories': ['rabbit harness', 'rabbit carrier', 'rabbit brush', 'rabbit nail clipper', 'rabbit water bottle'],
  
  // GUINEA PIG categories
  'guinea-pig-cages': ['guinea pig cage', 'guinea pig habitat', 'cavy cage', 'c&c cage', 'guinea pig enclosure'],
  'guinea-pig-food': ['guinea pig food', 'guinea pig pellet', 'cavy food', 'guinea pig hay', 'guinea pig treat'],
  'guinea-pig-houses': ['guinea pig house', 'guinea pig hideout', 'pigloo', 'guinea pig hut'],
  'guinea-pig-bedding': ['guinea pig bedding', 'fleece liner', 'guinea pig substrate'],
  'guinea-pig-toys': ['guinea pig toy', 'guinea pig tunnel', 'cavy toy'],
  'guinea-pig-accessories': ['guinea pig bottle', 'guinea pig bowl', 'hay rack', 'guinea pig brush'],
  
  // REPTILE categories
  'reptile-terrariums': ['terrarium', 'reptile tank', 'vivarium', 'reptile enclosure', 'snake tank', 'gecko tank'],
  'reptile-heating': ['heat lamp', 'heat mat', 'ceramic heater', 'basking lamp', 'reptile thermostat', 'under tank heater'],
  'reptile-lighting': ['uvb light', 'reptile light', 'basking light', 'reptile bulb', 'uvb lamp'],
  'reptile-food': ['reptile food', 'cricket', 'mealworm', 'reptile treat', 'calcium powder'],
  'reptile-decorations': ['reptile hide', 'reptile cave', 'reptile rock', 'climbing branch', 'reptile plant', 'reptile background'],
  'reptile-substrate': ['reptile substrate', 'reptile bedding', 'coconut fiber', 'reptile sand', 'bark substrate'],
  'reptile-accessories': ['reptile bowl', 'reptile thermometer', 'hygrometer', 'misting system', 'reptile tongs'],
};

// Generieke keywords die naar hoofdcategorieën verwijzen
const MAIN_CATEGORY_KEYWORDS: Record<string, string[]> = {
  'dogs': ['dog', 'puppy', 'canine', 'pup', 'doggy', 'doggie', 'pooch', 'hound', 'k9', 'k-9'],
  'cats': ['cat', 'kitten', 'feline', 'kitty', 'kitties', 'meow'],
  'birds': ['bird', 'parrot', 'parakeet', 'budgie', 'cockatiel', 'canary', 'finch', 'lovebird', 'cockatoo', 'macaw', 'conure'],
  'fish-aquarium': ['fish', 'aquarium', 'aquatic', 'tank', 'betta', 'goldfish', 'tropical fish', 'reef', 'marine'],
  'hamsters': ['hamster', 'dwarf hamster', 'syrian hamster', 'robo hamster', 'roborovski'],
  'rabbits': ['rabbit', 'bunny', 'bunnies', 'hare', 'lop'],
  'guinea-pigs': ['guinea pig', 'cavy', 'cavies', 'piggy'],
  'reptiles': ['reptile', 'snake', 'lizard', 'gecko', 'bearded dragon', 'turtle', 'tortoise', 'chameleon', 'iguana', 'python', 'boa'],
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
