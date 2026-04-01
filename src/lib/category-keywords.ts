/**
 * Centralized Category Keyword Map for Product Auto-Categorization
 * 
 * This file contains the definitive keyword mappings used for:
 * - Product imports and categorization
 * - Product recategorization tools
 * - Admin product management
 * 
 * IMPORTANT: Category slugs MUST match exactly with the database categories table.
 * Run this query to verify: SELECT slug FROM categories ORDER BY slug
 * 
 * PRIORITY ORDER for matching:
 * 1. Exclusion keywords (e.g., ferret/chinchilla should NOT go to cat/dog categories)
 * 2. Specific subcategory matches (multi-word phrases score higher)
 * 3. Animal + product type combination fallback
 */

// Keywords that should EXCLUDE a product from certain categories
export const EXCLUSION_KEYWORDS: Record<string, string[]> = {
  // Products with these keywords should NOT be in dog/cat categories
  'not-dog-cat': [
    'ferret', 'chinchilla', 'guinea pig', 'hamster', 'rabbit', 'bunny', 
    'bird', 'parrot', 'fish', 'aquarium', 'reptile', 'turtle', 'snake',
    'chicken', 'duck', 'small animal', 'rodent', 'gerbil', 'mouse', 'rat'
  ],
  // Products with these keywords should NOT be in bird categories
  'not-bird': [
    'dog', 'puppy', 'cat', 'kitten', 'hamster', 'rabbit', 'fish', 'reptile'
  ],
};

// Main category keyword map - slugs MUST match database exactly
export const CATEGORY_KEYWORD_MAP: Record<string, string[]> = {
  // ============ DOG-SPECIFIC CATEGORIES ============
  'dog-beds': [
    'dog bed', 'puppy bed', 'orthopedic bed dog', 'memory foam dog', 'bolster bed dog',
    'donut bed dog', 'calming bed dog', 'anti-anxiety bed dog', 'large dog bed', 'small dog bed',
    'medium dog bed', 'xl dog bed', 'xxl dog bed', 'waterproof dog bed', 'outdoor dog bed',
    'indoor dog bed', 'washable dog bed', 'heated dog bed', 'cooling dog bed', 'elevated dog bed',
    'crate bed dog', 'kennel pad dog', 'travel bed dog', 'portable dog bed', 'luxury dog bed',
    'sofa dog bed', 'couch dog bed', 'pillow dog bed', 'cushion dog bed', 'plush dog bed',
    'fleece dog bed', 'senior dog bed', 'arthritic dog bed', 'chew resistant bed dog'
  ],
  'dog-houses': [
    'dog house', 'dog kennel outdoor', 'outdoor dog house', 'indoor dog house', 'insulated dog house',
    'wooden dog house', 'plastic dog house', 'large dog house', 'small dog house', 'heated dog house',
    'weatherproof dog house', 'winter dog house', 'summer dog house', 'ventilated dog house',
    'elevated dog house', 'raised dog house', 'duplex dog house', 'a-frame dog house',
    'cabin dog house', 'cottage dog house', 'modern dog house', 'luxury dog house', 'dog shelter'
  ],
  'dog-toys': [
    'dog toy', 'puppy toy', 'chew toy dog', 'squeaky toy dog', 'rope toy dog', 'tug toy dog',
    'ball dog', 'tennis ball dog', 'fetch toy dog', 'frisbee dog', 'flying disc dog',
    'plush toy dog', 'stuffed toy dog', 'durable toy dog', 'tough toy dog', 'indestructible toy dog',
    'aggressive chewer toy', 'rubber toy dog', 'latex toy dog', 'kong dog', 'treat ball dog',
    'puzzle toy dog', 'interactive toy dog', 'snuffle mat dog', 'hide seek toy dog', 'dental toy dog'
  ],
  'dog-food-treats': [
    'dog food', 'puppy food', 'dog treat', 'puppy treat', 'dog biscuit', 'dog snack', 'dog jerky',
    'dog kibble', 'dry dog food', 'wet dog food', 'dog chew', 'bully stick', 'rawhide dog',
    'dental chew dog', 'training treat dog', 'freeze dried dog', 'dehydrated dog food',
    'omega dog', 'fish oil dog', 'supplement dog'
  ],
  'dog-bowls-feeders': [
    'dog bowl', 'puppy bowl', 'dog dish', 'slow feeder dog', 'elevated bowl dog', 'raised bowl dog',
    'stainless bowl dog', 'ceramic bowl dog', 'travel bowl dog', 'collapsible bowl dog',
    'automatic feeder dog', 'dog food dispenser', 'gravity feeder dog', 'smart feeder dog',
    'portion feeder dog', 'anti-gulp bowl dog', 'spill proof bowl dog', 'double bowl dog'
  ],
  'dog-collars-leashes': [
    'dog collar', 'puppy collar', 'dog leash', 'dog lead', 'dog harness', 'no pull harness dog',
    'retractable leash dog', 'reflective collar dog', 'led collar dog', 'glow collar dog',
    'nylon collar dog', 'leather collar dog', 'training collar dog', 'martingale dog',
    'front clip harness dog', 'back clip harness dog', 'step-in harness dog', 'vest harness dog',
    'hands free leash dog', 'waist leash dog', 'bungee leash dog', 'rope leash dog', 'chain leash dog',
    'bark collar', 'anti bark', 'bark stopper'
  ],
  'dog-grooming': [
    'dog brush', 'dog comb', 'dog shampoo', 'puppy shampoo', 'dog nail clipper', 'dog nail trimmer',
    'dog deshedding', 'slicker brush dog', 'grooming glove dog', 'dog bath', 'dog dryer',
    'dog grooming kit', 'dog grooming table', 'ear cleaner dog', 'dog toothbrush', 'dog dental care',
    'pet wipes dog', 'dog wipes'
  ],
  'dog-training': [
    'dog training', 'puppy training', 'training clicker dog', 'treat pouch dog', 'training whistle dog',
    'potty pad dog', 'puppy pad', 'pee pad dog', 'training pad dog', 'house training dog',
    'agility equipment dog', 'tunnel agility dog', 'weave poles dog', 'hurdle dog', 'jump agility dog',
    'dog bell training', 'potty bell dog', 'training dummy dog', 'fetch training dog',
    'dog potty', 'artificial grass dog', 'dog toilet'
  ],
  'dog-carriers': [
    'dog carrier', 'dog backpack carrier', 'dog sling', 'dog stroller', 'dog pram', 'dog buggy',
    'travel carrier dog', 'airline carrier dog', 'soft carrier dog', 'rolling carrier dog',
    'dog travel bag', 'car seat dog', 'booster seat dog', 'dog car hammock', 'dog seat cover',
    'pet stroller', 'foldable pet stroller', 'pet carrier wheels', 'jogging stroller pet'
  ],

  // ============ CAT-SPECIFIC CATEGORIES ============
  'cat-beds': [
    'cat bed', 'kitten bed', 'cat cushion', 'cat pillow', 'donut bed cat', 'calming bed cat',
    'heated bed cat', 'cooling bed cat', 'orthopedic bed cat', 'round bed cat', 'luxury cat bed',
    'plush cat bed', 'soft cat bed', 'cozy cat bed', 'washable cat bed', 'senior cat bed',
    'self-warming cat bed', 'enclosed bed cat', 'hooded bed cat', 'covered bed cat',
    'fluffy cat bed', 'faux fur cat bed'
  ],
  'cat-houses': [
    'cat house', 'cat condo stand alone', 'cat cottage', 'cat cabin', 'cat igloo', 'indoor cat house',
    'outdoor cat house', 'wooden cat house', 'insulated cat house', 'heated cat house',
    'weatherproof cat house', 'feral cat house', 'stray cat shelter', 'cat den', 'cat cave'
  ],
  'cat-exercise-wheels': [
    'cat wheel', 'cat treadmill', 'cat running wheel', 'cat exercise wheel', 'exercise wheel cat',
    'running wheel cat', 'treadmill cat', 'cat roller wheel', 'cat spinning wheel', 'cat fitness wheel',
    'large cat wheel', 'indoor cat wheel', 'silent cat wheel', 'wooden cat wheel'
  ],
  'cat-toys': [
    'cat toy', 'kitten toy', 'catnip toy', 'feather toy cat', 'wand toy cat', 'teaser cat',
    'mouse toy cat', 'fish toy cat', 'laser pointer cat', 'interactive toy cat', 'puzzle toy cat',
    'ball cat', 'tunnel cat', 'crinkle toy cat', 'kickeroo cat', 'automatic toy cat',
    'electronic toy cat', 'motion toy cat', 'cat spring', 'cat dancer', 'chasing toy cat',
    'cat tunnel outdoor'
  ],
  'cat-bowls-feeders': [
    'cat bowl', 'kitten bowl', 'cat dish', 'elevated bowl cat', 'tilted bowl cat', 'whisker friendly bowl',
    'slow feeder cat', 'automatic feeder cat', 'cat food dispenser', 'gravity feeder cat',
    'smart feeder cat', 'microchip feeder cat', 'multi-cat feeder', 'double bowl cat',
    'cat water fountain', 'cat fountain', 'pet fountain cat'
  ],
  'cat-collars-accessories': [
    'cat collar', 'kitten collar', 'breakaway collar cat', 'reflective collar cat', 'bell collar cat',
    'cat harness', 'cat leash', 'cat lead', 'cat id tag', 'cat bow tie', 'cat bandana',
    'gps tracker cat', 'airtag collar cat'
  ],
  'cat-grooming': [
    'cat brush', 'cat comb', 'cat shampoo', 'kitten shampoo', 'cat nail clipper', 'cat nail trimmer',
    'cat deshedding', 'slicker brush cat', 'grooming glove cat', 'cat bath', 'ear cleaner cat',
    'cat steam brush', 'steamy brush cat', 'spray brush cat'
  ],
  'cat-carriers': [
    'cat carrier', 'kitten carrier', 'cat backpack', 'cat travel bag', 'airline carrier cat',
    'soft carrier cat', 'hard carrier cat', 'expandable carrier cat', 'bubble backpack cat',
    'cat sling', 'rolling carrier cat', 'cat stroller', 'cat kennel travel'
  ],
  'cat-furniture': [
    'cat furniture', 'cat shelf wall', 'wall mounted cat shelf', 'cat bridge', 'cat walkway', 'cat perch',
    'window perch cat', 'cat platform', 'cat climbing wall', 'cat gym', 'vertical cat space'
  ],
  'cat-hammocks': [
    'cat hammock', 'hanging bed cat', 'window hammock cat', 'radiator bed cat', 'suspended bed cat',
    'suction cup bed cat', 'cage hammock cat', 'swing bed cat', 'wall mounted bed cat',
    'shelf bed cat', 'floating bed cat', 'macrame hammock cat', 'bunk bed cat'
  ],
  'cat-scratching-posts': [
    'scratching post', 'cat scratcher', 'scratch pad', 'sisal scratcher', 'cardboard scratcher',
    'scratching board', 'scratch furniture', 'vertical scratcher', 'horizontal scratcher',
    'corner scratcher', 'wall scratcher cat', 'scratching mat cat'
  ],
  'cat-trees-and-condos': [
    'cat tree', 'cat tower', 'cat condo', 'climbing tree cat', 'multi level cat', 'cat activity center',
    'cat play tower', 'cat castle', 'cat gym tower', 'tall cat tree', 'large cat tree',
    'cat tree condo', 'cat climbing tower', 'cat scratching tree', 'cat perch tower',
    'multi-level cat', 'cat tree with', 'cat tower with'
  ],
  'cat-litter-boxes': [
    'litter box', 'cat litter', 'litter tray', 'litter scoop', 'cat toilet', 'self cleaning litter',
    'automatic litter', 'covered litter', 'hooded litter', 'top entry litter', 'litter mat',
    'litter enclosure', 'litter furniture', 'litter cabinet'
  ],

  // ============ SMALL ANIMALS - HAMSTERS ============
  'hamster-cages': [
    'hamster cage', 'hamster habitat', 'hamster tank', 'hamster enclosure', 'dwarf hamster cage',
    'syrian hamster cage', 'hamster house cage', 'small animal cage',
    // Include ferret and chinchilla here as they use similar caging
    'ferret cage', 'ferret enclosure', 'chinchilla cage', 'chinchilla enclosure',
    'rat cage', 'mouse cage', 'gerbil cage', 'small pet cage',
    'multi-level small animal', 'wire cage small animal'
  ],
  'hamster-wheels': [
    'hamster wheel', 'exercise wheel', 'running wheel hamster', 'silent wheel', 'flying saucer wheel',
    'hamster ball', 'exercise ball hamster', 'spinner wheel'
  ],

  // ============ SMALL ANIMALS - RABBITS ============
  'rabbit-cages': [
    'rabbit cage', 'rabbit hutch', 'bunny cage', 'rabbit enclosure', 'rabbit pen',
    'rabbit house outdoor', 'wooden rabbit hutch', 'rabbit habitat',
    'chicken coop small', 'duck house'  // Small animal hutches often shared
  ],

  // ============ SMALL ANIMALS - GUINEA PIGS ============
  'guinea-pig-cages': [
    'guinea pig cage', 'guinea pig habitat', 'cavy cage', 'c&c cage', 'guinea pig enclosure',
    'guinea pig hutch', 'guinea pig pen'
  ],

  // ============ BIRDS ============
  'bird-cages': [
    'bird cage', 'birdcage', 'parrot cage', 'parakeet cage', 'canary cage', 'finch cage', 'aviary',
    'flight cage', 'cockatiel cage', 'budgie cage', 'lovebird cage', 'large bird cage',
    'outdoor bird cage', 'stackable bird cage', 'double bird cage'
  ],
  'bird-toys': [
    'bird toy', 'parrot toy', 'bird swing', 'bird ladder', 'bird bell', 'bird mirror', 
    'foraging toy bird', 'bird perch toy', 'climbing toy bird', 'hanging toy bird',
    'bird playground', 'bird training stand', 't-bracket bird'
  ],
  'bird-bowls-feeders': [
    'bird feeder', 'bird bowl', 'bird waterer', 'seed cup', 'bird dish',
    'hummingbird feeder', 'wild bird feeder', 'outdoor bird feeder', 'hanging bird feeder',
    'squirrel proof feeder', 'solar bird feeder', 'smart bird feeder', 'bird bath',
    'bird feeder pole', 'bird house pole'
  ],
  'bird-nests': [
    'bird nest', 'nesting box', 'breeding box', 'bird house nest', 'birdhouse',
    'bird house outdoor', 'wooden bird house'
  ],
  'bird-perches': [
    'bird perch', 'parrot perch', 'natural perch', 'rope perch', 'bird stand',
    'bird training perch', 'window perch bird'
  ],

  // ============ REPTILES ============
  'reptile-terrariums': [
    'terrarium', 'reptile tank', 'vivarium', 'reptile enclosure', 'snake tank', 'gecko tank',
    'bearded dragon tank', 'turtle tank', 'tortoise enclosure', 'reptile habitat',
    'turtle aquarium', 'turtle kit'
  ],
  'reptile-lighting': [
    'uvb light reptile', 'reptile light', 'basking light', 'reptile bulb', 'uvb lamp',
    'heat lamp reptile', 'reptile led'
  ],

  // ============ FISH & AQUARIUM ============
  'fish-tanks': [
    'fish tank', 'aquarium', 'fish bowl', 'nano tank', 'betta tank', 'reef tank',
    'planted aquarium', 'fish aquarium kit'
  ],

  // ============ GENERIC PET (for multi-species products) ============
  'pet-houses': [
    'pet tent', 'pet playpen', 'portable pet', 'foldable pet tent', 'pet exercise pen',
    'pet enclosure portable'
  ],
};

// Animal detection keywords for fallback matching
export const ANIMAL_KEYWORDS: Record<string, string[]> = {
  'dogs': ['dog', 'puppy', 'canine', 'pup', 'doggy', 'doggie', 'pooch', 'hound', 'k9', 'k-9'],
  'cats': ['cat', 'kitten', 'feline', 'kitty', 'kitties'],
  'birds': ['bird', 'parrot', 'parakeet', 'budgie', 'cockatiel', 'canary', 'finch', 'lovebird', 'cockatoo', 'macaw', 'conure', 'aviary'],
  'hamsters': ['hamster', 'dwarf hamster', 'syrian hamster', 'robo hamster', 'roborovski', 'ferret', 'chinchilla', 'gerbil', 'mouse', 'rat', 'small animal', 'rodent'],
  'rabbits': ['rabbit', 'bunny', 'bunnies', 'hare', 'lop'],
  'guinea-pigs': ['guinea pig', 'cavy', 'cavies'],
  'reptiles': ['reptile', 'snake', 'lizard', 'gecko', 'bearded dragon', 'turtle', 'tortoise', 'chameleon', 'iguana', 'python', 'boa'],
  'fish-aquarium': ['fish', 'aquarium', 'aquatic', 'betta', 'goldfish', 'tropical fish', 'reef', 'marine'],
};

// Product type keywords for fallback matching
export const PRODUCT_TYPE_KEYWORDS: Record<string, string[]> = {
  'beds': ['bed', 'cushion', 'mattress', 'sleeping', 'nest', 'donut', 'bolster', 'orthopedic', 'memory foam', 'plush bed'],
  'toys': ['toy', 'play', 'chew', 'squeaky', 'interactive', 'puzzle', 'ball', 'rope', 'plush toy', 'stuffed'],
  'cages': ['cage', 'enclosure', 'habitat', 'pen', 'hutch', 'tank', 'vivarium', 'terrarium'],
  'carriers': ['carrier', 'crate', 'transport', 'travel', 'backpack', 'bag', 'airline', 'stroller'],
  'bowls-feeders': ['bowl', 'feeder', 'dish', 'fountain', 'waterer', 'slow feed', 'elevated', 'automatic feeder'],
  'houses': ['house', 'kennel', 'shelter', 'cave', 'hideout', 'hut', 'igloo', 'tent'],
  'grooming': ['brush', 'comb', 'grooming', 'shampoo', 'nail', 'trimmer', 'deshedding', 'fur', 'coat care', 'wipes'],
  'collars-leashes': ['collar', 'leash', 'harness', 'lead', 'walking', 'tag', 'id'],
  'trees-furniture': ['tree', 'tower', 'condo', 'shelf', 'perch', 'bridge', 'climbing', 'furniture'],
  'scratching': ['scratching', 'scratcher', 'scratch pad', 'sisal'],
  'litter': ['litter', 'toilet', 'potty', 'scoop'],
  'training': ['training', 'potty pad', 'pee pad', 'agility'],
};

// Fallback category mapping: animal + product type → specific category
export const FALLBACK_CATEGORY_MAP: Record<string, Record<string, string>> = {
  'dogs': {
    'beds': 'dog-beds',
    'toys': 'dog-toys',
    'cages': 'dog-houses',
    'carriers': 'dog-carriers',
    'bowls-feeders': 'dog-bowls-feeders',
    'houses': 'dog-houses',
    'grooming': 'dog-grooming',
    'collars-leashes': 'dog-collars-leashes',
    'training': 'dog-training',
  },
  'cats': {
    'beds': 'cat-beds',
    'toys': 'cat-toys',
    'cages': 'cat-houses',
    'carriers': 'cat-carriers',
    'bowls-feeders': 'cat-bowls-feeders',
    'houses': 'cat-houses',
    'grooming': 'cat-grooming',
    'collars-leashes': 'cat-collars-accessories',
    'trees-furniture': 'cat-trees-and-condos',
    'scratching': 'cat-scratching-posts',
    'litter': 'cat-litter-boxes',
    'wheels': 'cat-exercise-wheels',
  },
  'birds': {
    'cages': 'bird-cages',
    'toys': 'bird-toys',
    'bowls-feeders': 'bird-bowls-feeders',
    'houses': 'bird-nests',
  },
  'hamsters': {
    'cages': 'hamster-cages',
    'toys': 'hamster-wheels',
    'houses': 'hamster-cages',
  },
  'rabbits': {
    'cages': 'rabbit-cages',
    'houses': 'rabbit-cages',
  },
  'guinea-pigs': {
    'cages': 'guinea-pig-cages',
    'houses': 'guinea-pig-cages',
  },
  'reptiles': {
    'cages': 'reptile-terrariums',
    'houses': 'reptile-terrariums',
  },
};

/**
 * Determines the best category for a product based on its name and description
 * Uses a multi-pass approach:
 * 1. Check exclusion keywords to avoid mismatches
 * 2. Try to match specific subcategory keywords
 * 3. Fall back to animal + product type combination
 */
export function determineProductCategory(
  productName: string,
  description: string | null = null,
  availableCategorySlugs?: string[]
): { category: string; score: number; keywords: string[]; confidence: 'high' | 'medium' | 'low' } {
  const text = `${productName} ${description || ''}`.toLowerCase();
  
  type Confidence = 'high' | 'medium' | 'low';
  
  // Step 1: Detect if this is a small animal product that shouldn't go to dog/cat
  const hasExclusionKeyword = EXCLUSION_KEYWORDS['not-dog-cat'].some(kw => text.includes(kw));
  
  // Step 2: Try to match specific subcategory keywords
  let bestMatch: { category: string; score: number; keywords: string[]; confidence: Confidence } = { 
    category: 'dogs', 
    score: 0, 
    keywords: [] as string[], 
    confidence: 'low' 
  };
  
  for (const [categorySlug, keywords] of Object.entries(CATEGORY_KEYWORD_MAP)) {
    // Skip dog/cat categories if exclusion keywords are found
    if (hasExclusionKeyword && (categorySlug.startsWith('dog-') || categorySlug.startsWith('cat-'))) {
      // Only skip if the product doesn't explicitly mention dog/cat
      const explicitlyDogCat = 
        (categorySlug.startsWith('dog-') && (text.includes('dog') || text.includes('puppy'))) ||
        (categorySlug.startsWith('cat-') && (text.includes('cat') || text.includes('kitten')));
      if (!explicitlyDogCat) continue;
    }
    
    let matchCount = 0;
    const matchedKeywords: string[] = [];
    
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        // Multi-word matches count more (more specific)
        matchCount += keyword.split(' ').length;
        matchedKeywords.push(keyword);
      }
    }
    
    if (matchCount > bestMatch.score) {
      bestMatch = {
        category: categorySlug,
        score: matchCount,
        keywords: matchedKeywords,
        confidence: matchCount >= 4 ? 'high' : matchCount >= 2 ? 'medium' : 'low'
      };
    }
  }
  
  // If we found a good match, return it
  if (bestMatch.score >= 2) {
    // Verify the category exists if we have a list
    if (availableCategorySlugs && !availableCategorySlugs.includes(bestMatch.category)) {
      console.warn(`Category ${bestMatch.category} not found in available categories`);
    }
    return bestMatch;
  }
  
  // Step 3: Fallback - detect animal and product type separately
  let detectedAnimal: string | null = null;
  let detectedProductType: string | null = null;
  
  for (const [animal, keywords] of Object.entries(ANIMAL_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      detectedAnimal = animal;
      break;
    }
  }
  
  for (const [productType, keywords] of Object.entries(PRODUCT_TYPE_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      detectedProductType = productType;
      break;
    }
  }
  
  if (detectedAnimal && detectedProductType) {
    const fallbackCategory = FALLBACK_CATEGORY_MAP[detectedAnimal]?.[detectedProductType];
    if (fallbackCategory) {
      return {
        category: fallbackCategory,
        score: 1,
        keywords: [detectedAnimal, detectedProductType],
        confidence: 'low'
      };
    }
  }
  
  // Default to dogs if nothing matched
  return {
    category: detectedAnimal ? `${detectedAnimal}` : 'dogs',
    score: 0,
    keywords: [],
    confidence: 'low'
  };
}
