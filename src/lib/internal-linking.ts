/**
 * Internal Linking Strategy for Blog Posts
 * Automatically converts keywords in blog content to internal links.
 * Includes cornerstone sculpt links for priority authority flow.
 * Money collections receive highest priority (priority 15) to ensure
 * every blog post links to at least 1 money collection.
 * 
 * Revenue-tier-aware: Tier 1 collections get +40% link weight (priority boost),
 * Tier 3 collections get -30% (priority reduction).
 */

import { BLOG_CORNERSTONE_TRIGGERS, PRIORITY_CORNERSTONES, getCornerstoneAnchor } from './link-sculpt-config';
import { getCategoryCollectionUrl } from './category-collection-map';
import { MONEY_COLLECTIONS } from './money-collections';
import { getLinkWeightMultiplier } from './revenue-tier-engine';

interface LinkableKeyword {
  keyword: string;
  url: string;
  type: 'product' | 'category' | 'blog' | 'cornerstone';
  priority: number; // Higher priority = more likely to be linked
}

interface Product {
  id: string;
  name: string;
  slug?: string | null;
  category: string | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

// Convert string to URL-friendly slug
const toSlug = (str: string): string => {
  return str
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

// Common pet-related keywords that should link to categories
// Extended with more synonyms and product-specific terms for better SEO linking
const categoryKeywords: Record<string, string[]> = {
  // Dog categories
  'dogs': ['dog', 'dogs', 'puppy', 'puppies', 'canine', 'canines', 'pup', 'pups', 'doggy', 'pooch', 'pet dog', 'furry friend', 'dog owner', 'dog parent'],
  'dog-beds': ['dog bed', 'dog beds', 'pet bed', 'orthopedic bed', 'memory foam bed', 'elevated bed', 'cooling bed', 'heated bed', 'dog cushion', 'dog mattress', 'dog sleeping', 'comfortable bed', 'supportive bed', 'joint support bed'],
  'dog-collars-leashes': ['dog collar', 'dog leash', 'collar', 'leash', 'harness', 'dog harness', 'training leash', 'retractable leash', 'walking leash', 'slip lead', 'martingale', 'walking gear', 'dog walking', 'reflective collar', 'adjustable harness'],
  'dog-houses': ['dog house', 'dog kennel', 'outdoor kennel', 'dog crate', 'dog cage', 'pet carrier', 'travel crate', 'crate training'],
  'dog-carriers': ['dog carrier', 'pet carrier', 'travel carrier', 'airline carrier', 'soft carrier', 'backpack carrier', 'dog stroller', 'pet stroller', 'dog travel', 'portable carrier'],
  'dog-stairs': ['dog stairs', 'pet stairs', 'dog steps', 'pet ramp', 'dog ramp', 'mobility aid'],
  
  // Cat categories
  'cats': ['cat', 'cats', 'kitten', 'kittens', 'feline', 'felines', 'kitty', 'kitties', 'indoor cat', 'pet cat', 'cat owner', 'cat parent', 'cat care'],
  'cat-beds': ['cat bed', 'cat beds', 'cat cushion', 'cat hammock', 'window perch', 'cat cave', 'heated cat bed', 'cozy cat bed', 'cat sleeping'],
  'cat-trees-and-condos': ['cat tree', 'cat trees', 'scratching post', 'scratch post', 'cat tower', 'cat towers', 'cat condo', 'cat condos', 'climbing tower', 'cat furniture', 'cat playground', 'vertical space', 'climbing structure', 'cat tree house', 'tree for cats', 'pear wood cat tree'],
  'cat-furniture': ['cat furniture', 'cat shelf', 'cat shelves', 'wall mounted', 'cat perch', 'cat bridge', 'cat climbing'],
  'cat-litter-boxes': ['litter box', 'litter boxes', 'automatic litter box', 'self-cleaning litter box', 'cat litter', 'litter tray', 'enclosed litter box', 'covered litter box', 'smart litter box', 'odor control', 'clumping litter', 'crystal litter', 'natural litter'],
  'cat-scratching-posts': ['scratching post', 'scratch pad', 'cardboard scratcher', 'sisal post', 'cat scratcher', 'scratching behavior', 'claw maintenance'],
  'cat-toys': ['chase toy', 'cat toy', 'cat toys', 'feather toy', 'laser pointer', 'interactive toy', 'wand toy', 'mouse toy', 'cat playtime', 'hunting instinct'],
  'cat-carriers': ['cat carrier', 'portable cat carrier', 'soft-sided cat carrier', 'cat kennel', 'travel pet crate', 'cat travel crate', 'airline approved cat carrier'],
  'cat-houses': ['cat house', 'cat houses', 'cat igloo', 'indoor cat house', 'cat shelter'],
  
  // Bird categories
  'birds': ['bird', 'birds', 'parrot', 'parrots', 'parakeet', 'parakeets', 'cockatiel', 'cockatiels', 'budgie', 'budgies', 'canary', 'canaries', 'finch', 'finches', 'pet bird', 'avian', 'bird owner', 'bird care', 'singing bird'],
  'bird-cages': ['bird cage', 'bird cages', 'aviary', 'flight cage', 'parrot cage', 'travel cage', 'cage setup', 'cage size', 'bar spacing', 'cage placement'],
  'bird-feeders': ['bird feeder', 'bird feeders', 'seed feeder', 'water dispenser', 'feeding bowl', 'bird bath', 'seed mix', 'pellet diet', 'bird nutrition', 'fresh vegetables'],
  'bird-toys': ['bird toy', 'bird toys', 'bird swing', 'bird perch', 'foraging toy', 'chew toy', 'climbing toy', 'mental stimulation', 'bird enrichment', 'mirror toy', 'bell toy', 'ladder toy'],
  
  // Fish & Aquarium
  'fish-aquarium': ['fish', 'tropical fish', 'goldfish', 'betta', 'guppy', 'aquatic pet'],
  'fish-tanks': ['aquarium', 'fish tank', 'tank', 'nano tank', 'planted tank', 'saltwater tank', 'freshwater tank', 'aquarium kit'],
  
  // Small pets
  'small-pets': ['small pet', 'small pets', 'pocket pet', 'exotic pet'],
  'hamsters': ['hamster', 'hamsters', 'dwarf hamster', 'syrian hamster'],
  'hamster-cages': ['hamster cage', 'hamster habitat', 'hamster house', 'hamster wheel', 'exercise wheel'],
  'hamster-wheels': ['hamster wheel', 'exercise wheel', 'silent wheel', 'running wheel'],
  'rabbits': ['rabbit', 'rabbits', 'bunny', 'bunnies', 'pet rabbit'],
  'rabbit-cages': ['rabbit cage', 'rabbit hutch', 'bunny cage', 'rabbit pen', 'rabbit enclosure'],
  'guinea-pigs': ['guinea pig', 'guinea pigs', 'cavy', 'cavies', 'guinea pig care', 'pet guinea pig'],
  'guinea-pig-cages': ['guinea pig cage', 'guinea pig cages', 'guinea pig habitat', 'cavy cage', 'c&c cage', 'guinea pig playpen', 'guinea pig enclosure', 'guinea pig pen', 'guinea pig hutch'],
  'guinea-pig-toys': ['guinea pig toy', 'guinea pig toys', 'hideout', 'tunnel', 'hay feeder', 'guinea pig enrichment'],
  
  // Reptiles
  'reptiles': ['reptile', 'reptiles', 'lizard', 'lizards', 'gecko', 'geckos', 'bearded dragon', 'bearded dragons', 'snake', 'snakes', 'turtle', 'turtles', 'tortoise', 'tortoises', 'ball python', 'corn snake', 'leopard gecko', 'crested gecko', 'reptile care'],
  'reptile-terrariums': ['terrarium', 'terrariums', 'reptile tank', 'vivarium', 'reptile enclosure', 'reptile habitat', 'glass enclosure', 'screen enclosure', 'bioactive terrarium', 'desert terrarium', 'tropical terrarium'],
  'reptile-lighting': ['heat lamp', 'uvb light', 'uvb lighting', 'basking light', 'basking spot', 'reptile lighting', 'heat mat', 'ceramic heat emitter', 'temperature gradient', 'thermostat', 'heat source'],
  
  // General pet supplies - mapped to actual categories
  'dog-food-treats': ['pet food', 'dog food', 'treats', 'snacks', 'kibble', 'wet food', 'dry food', 'raw diet', 'premium food', 'grain-free', 'high protein', 'balanced nutrition', 'dog treat', 'training treat', 'dental treat', 'healthy snack', 'natural treat'],
  'cat-food-treats': ['cat food', 'cat treats', 'cat snacks'],
  'dog-bowls-feeders': ['food bowl', 'water bowl', 'feeding bowl', 'slow feeder', 'automatic feeder', 'smart feeder', 'elevated bowl', 'stainless steel bowl', 'portion control', 'feeding schedule', 'water fountain', 'pet fountain', 'water dispenser', 'drinking fountain', 'filtered water', 'fresh water', 'hydration'],
  'dog-toys': ['pet toy', 'pet toys', 'interactive toy', 'puzzle toy', 'enrichment toy', 'chew toy', 'squeaky toy', 'plush toy', 'rope toy', 'ball toy', 'mental stimulation', 'physical exercise', 'dog toy', 'dog enrichment toys', 'interactive dog games', 'outdoor dog games'],
  'pet-beds': ['pet bed', 'pet beds', 'sleeping pad', 'pet cushion', 'cozy bed', 'washable bed', 'waterproof bed'],
  'pet-houses': ['pet house', 'pet shelter', 'outdoor house', 'indoor house', 'dog house', 'cat house', 'outdoor shelter'],
  'dog-grooming': ['grooming', 'pet grooming', 'brush', 'brushing', 'comb', 'nail clipper', 'nail trimmer', 'nail grinder', 'shampoo', 'conditioner', 'deshedding', 'grooming kit', 'fur care', 'coat care', 'mat removal', 'ear cleaning', 'dental care', 'deshedding tool', 'fur remover', 'lint roller', 'pet hair brush', 'undercoat rake'],
  'pet-collars-leashes': ['collar', 'leash', 'harness', 'pet collar', 'pet leash', 'id tag', 'name tag'],
  'dog-training': ['training', 'dog training', 'puppy training', 'clicker training', 'training treat', 'training pad', 'pee pad', 'potty training'],
  'cat-hammocks': ['pet hammock', 'cat hammock', 'window hammock', 'hanging bed', 'suspended bed'],
  'bird-nests': ['pet nest', 'bird nest', 'nesting box', 'breeding box', 'cozy nest'],
  'pet-furniture': ['pet furniture', 'cat furniture', 'dog furniture', 'modern pet', 'designer pet'],
  'pet-bags': ['pet bag', 'carrier bag', 'travel bag', 'tote carrier', 'sling carrier'],
};

// SEO Collection URLs - high-intent landing pages with dedicated content
const seoCollectionKeywords: Record<string, string[]> = {
  'dog-travel-accessories': [
    'dog travel accessories', 'dog car safety', 'dog hammock for car', 'dog back seat cover',
    'car safety products for dogs', 'pet travel gear', 'dog car seat', 'travel crate',
    'pet road trip', 'traveling with dogs', 'dog car harness', 'car seat protector'
  ],
  'indoor-cat-enrichment': [
    'indoor cat enrichment', 'indoor cat toys', 'boredom toys for cats', 'enrichment toys for indoor cats',
    'cat mental stimulation', 'interactive cat toys', 'cat puzzle feeders', 'keep cats happy',
    'indoor cat activities', 'cat boredom solutions', 'stimulation for cats'
  ],
  'no-spill-dog-feeding': [
    'no spill dog bowls', 'no-spill dog bowl', 'elevated dog bowls', 'mess free dog feeder',
    'slow feeder dog bowl', 'anti-splash water bowl', 'raised dog bowl', 'spill-proof dog dishes',
    'messy dog mealtime', 'dog gulping food', 'slow down dog eating'
  ],
  'guinea-pig-cages-playpens': [
    'guinea pig cage', 'guinea pig cages', 'guinea pig playpen', 'guinea pig enclosure',
    'guinea pig habitat', 'cavy cage', 'c&c cage', 'guinea pig pen', 'guinea pig hutch'
  ],
  'cat-condos': [
    'cat condo', 'cat condos', 'cat condo for large cats', 'modern cat condo',
    'wooden cat condo', 'multi cat condo', 'cat condo vs cat tree', 'indoor cat condo',
    'cat hideaway furniture', 'enclosed cat furniture', 'cat condo with scratching post'
  ],
  'large-cat-condos': [
    'large cat condo', 'big cat condo', 'maine coon cat condo', 'heavy duty cat condo',
    'cat condo for 20 lb cat', 'cat furniture for large cats'
  ],
  'modern-cat-condos': [
    'modern cat condo', 'stylish cat condo', 'minimalist cat condo', 'aesthetic cat furniture',
    'designer cat condo', 'mid century cat furniture'
  ],
  'multi-cat-condos': [
    'multi cat condo', 'cat condo for multiple cats', 'two cat condo', 'multi level cat condo',
    'cat condo for 2 cats', 'cat condo for 3 cats'
  ],
  'wooden-cat-condos': [
    'wooden cat condo', 'solid wood cat condo', 'natural wood cat furniture',
    'eco friendly cat condo', 'bamboo cat condo'
  ],
  // New high-intent collection keywords
  'best-dog-beds-large-dogs': [
    'dog bed for large dogs', 'large dog bed', 'big dog bed', 'orthopedic large dog bed',
    'bed for 70 pound dog', 'bed for 100 pound dog', 'xl dog bed', 'extra large dog bed'
  ],
  'self-cleaning-litter-box-guide': [
    'self cleaning litter box', 'automatic litter box for multiple cats',
    'best self cleaning litter box', 'robot litter box', 'hands free litter box',
    'automatic cat litter solution', 'reduce litter smell at home',
    'smart litter box', 'no scoop litter box', 'self cleaning cat litter'
  ],
  'best-cat-litter-boxes': [
    'best cat litter box', 'top rated litter boxes', 'litter box for odor control',
    'enclosed litter box', 'hooded litter box', 'covered litter box'
  ],
  'best-interactive-dog-toys': [
    'best dog toy', 'interactive dog toy', 'puzzle toy for dogs', 'enrichment toy for dogs',
    'boredom busting dog toy', 'mental stimulation toy for dogs'
  ],
  'orthopedic-calming-dog-beds': [
    'orthopedic dog bed', 'calming dog bed', 'memory foam dog bed', 'anxiety dog bed',
    'joint support dog bed', 'bed for older dogs', 'senior dog bed'
  ],
  'best-slow-feeder-dog-bowls': [
    'slow feeder dog bowl', 'anti gulp dog bowl', 'bloat prevention bowl',
    'slow eating bowl', 'puzzle feeder bowl for dogs'
  ],
  'indestructible-dog-chew-toys': [
    'indestructible dog toy', 'tough dog toy', 'heavy duty chew toy',
    'dog toy for aggressive chewers', 'power chewer toy', 'durable dog toy'
  ],
  'best-dog-car-seats': [
    'dog car seat', 'dog booster seat', 'car seat for small dogs',
    'crash tested dog seat', 'pet car seat', 'dog travel seat'
  ],
  'best-cat-beds': [
    'best cat bed', 'cat cave', 'donut cat bed', 'heated cat bed',
    'calming cat bed', 'cozy cat bed', 'cat sleeping spot'
  ],
  'best-dog-harnesses': [
    'no pull dog harness', 'best dog harness', 'front clip harness',
    'easy walk harness', 'dog walking harness', 'anti pull harness'
  ],
  'best-cat-scratching-posts': [
    'cat scratching post', 'best scratcher for cats', 'sisal scratching post',
    'tall scratching post', 'cat scratch pad', 'durable cat scratcher'
  ],
  'best-cat-carriers': [
    'best cat carrier', 'airline approved cat carrier', 'cat carrier for vet',
    'soft sided cat carrier', 'cat backpack carrier', 'expandable cat carrier'
  ],
  'best-cat-window-perches': [
    'cat window perch', 'cat window shelf', 'suction cup cat perch',
    'window hammock for cats', 'cat bird watching perch'
  ],
  'dog-car-travel-safety-seats': [
    'dog car safety', 'dog travel safety', 'pet car restraint',
    'dog seat belt', 'car barrier for dogs', 'dog car hammock'
  ],
  'best-dog-grooming-kits': [
    'dog grooming kit', 'home grooming kit', 'pet grooming vacuum',
    'dog clipper set', 'grooming kit for dogs at home'
  ],
  'best-interactive-cat-toys': [
    'interactive cat toy', 'electronic cat toy', 'automatic cat toy',
    'laser toy for cats', 'robotic cat toy', 'motorized cat toy'
  ],
  'best-dog-travel-water-bottles': [
    'dog water bottle', 'portable dog water bottle', 'dog travel water',
    'hiking water bottle for dogs', 'pet water bottle for walks'
  ],
  'best-dog-crate-beds': [
    'dog crate bed', 'crate pad', 'crate mat for dogs', 'washable crate bed',
    'chew proof crate bed', 'dog kennel pad'
  ]
};

// Product-specific keyword phrases for better matching
// These are common phrases that appear in blog content and should link to relevant products
const productPhrases: Record<string, string> = {
  // Litter boxes - using actual category slug
  'automatic litter box': 'cat-litter-boxes',
  'self-cleaning litter': 'cat-litter-boxes',
  'smart litter box': 'cat-litter-boxes',
  'enclosed litter box': 'cat-litter-boxes',
  'litter robot': 'cat-litter-boxes',
  'odor control litter': 'cat-litter-boxes',
  
  // Pet tech & GPS - no specific category, use dogs as fallback
  'gps tracker': 'dogs',
  'gps pet tracker': 'dogs',
  'pet camera': 'dogs',
  'smart pet': 'dogs',
  'pet monitor': 'dogs',
  
  // Feeding - using actual category slug
  'automatic feeder': 'dog-bowls-feeders',
  'automatic pet feeder': 'dog-bowls-feeders',
  'smart feeder': 'dog-bowls-feeders',
  'slow feeder bowl': 'dog-bowls-feeders',
  'elevated feeder': 'dog-bowls-feeders',
  'puzzle feeder': 'dog-bowls-feeders',
  'portion control': 'dog-bowls-feeders',
  'timed feeder': 'dog-bowls-feeders',
  'gravity feeder': 'dog-bowls-feeders',
  
  // Water fountains - using actual category slug
  'water fountain': 'cat-bowls-feeders',
  'cat water fountain': 'cat-bowls-feeders',
  'pet water fountain': 'dog-bowls-feeders',
  'filtered water fountain': 'cat-bowls-feeders',
  'stainless steel fountain': 'cat-bowls-feeders',
  'ceramic fountain': 'cat-bowls-feeders',
  
  // Health & comfort - Dog beds
  'orthopedic dog bed': 'dog-beds',
  'orthopedic bed': 'dog-beds',
  'memory foam dog': 'dog-beds',
  'memory foam bed': 'dog-beds',
  'cooling mat': 'pet-beds',
  'heated pet bed': 'pet-beds',
  'bolster bed': 'dog-beds',
  'calming bed': 'dog-beds',
  'waterproof bed': 'dog-beds',
  'joint support': 'dog-beds',
  
  // Interactive toys & puzzles - using actual category slug
  'puzzle toy': 'dog-toys',
  'interactive puzzle': 'dog-toys',
  'treat puzzle': 'dog-toys',
  'brain game': 'dog-toys',
  'mental stimulation': 'dog-toys',
  'enrichment toy': 'dog-toys',
  'snuffle mat': 'dog-toys',
  'kong toy': 'dog-toys',
  
  // Travel & carriers - using actual category slugs
  'airline approved': 'dog-carriers',
  'travel carrier': 'dog-carriers',
  'pet backpack': 'dog-carriers',
  'portable carrier': 'dog-carriers',
  'soft-sided carrier': 'dog-carriers',
  'expandable carrier': 'dog-carriers',
  'rolling carrier': 'dog-carriers',
  'car seat carrier': 'dog-carriers',
  
  // Anxiety & calming - using actual category slug
  'anxiety vest': 'dog-training',
  'calming vest': 'dog-training',
  'thundershirt': 'dog-training',
  'compression wrap': 'dog-training',
  'calming aid': 'dog-training',
  'stress relief': 'dog-training',
  'separation anxiety': 'dog-training',
  
  // Training - using actual category slug
  'training collar': 'dog-training',
  'bark collar': 'dog-training',
  'invisible fence': 'dog-training',
  'pet door': 'dogs',
  'clicker training': 'dog-training',
  'training treat': 'dog-food-treats',
  
  // Grooming - using actual category slug
  'nail grinder': 'dog-grooming',
  'pet dryer': 'dog-grooming',
  'grooming table': 'dog-grooming',
  'dematting comb': 'dog-grooming',
  'deshedding brush': 'dog-grooming',
  'slicker brush': 'dog-grooming',
  
  // Small pet bedding & enclosures
  'small pet bedding': 'small-pets',
  'hamster bedding': 'hamsters',
  'rabbit bedding': 'rabbits',
  'guinea pig bedding': 'guinea-pigs',
  'guinea pig playpen': 'guinea-pig-cages',
  'guinea pig enclosure': 'guinea-pig-cages',
  'guinea pig hutch': 'guinea-pig-cages',
  'pet bedding': 'small-pets',
  'enclosure': 'small-pets',
  
  // Cat carriers (target keywords)
  'portable cat carrier': 'cat-carriers',
  'soft-sided cat carrier': 'cat-carriers',
  'cat kennel': 'cat-carriers',
  'travel pet crate': 'cat-carriers',
  'cat travel carrier': 'cat-carriers',
  
  // Cat trees target keywords
  'pear wood cat tree': 'cat-trees-and-condos',
  'cat tree house': 'cat-trees-and-condos',
  'tree for cats': 'cat-trees-and-condos',
  'cat condo': 'cat-trees-and-condos',
  'cat condos': 'cat-trees-and-condos',
  
  // Dog enrichment target keywords
  'dog enrichment toys': 'dog-toys',
  'interactive dog games': 'dog-toys',
  'outdoor dog games': 'dog-toys',
};

// Common stop words to exclude from keyword extraction
const stopWords = new Set([
  'with', 'for', 'and', 'the', 'from', 'that', 'this', 'have', 'has',
  'your', 'their', 'they', 'will', 'can', 'all', 'are', 'was', 'were',
  'been', 'being', 'each', 'which', 'when', 'where', 'while', 'than',
  'then', 'into', 'over', 'under', 'after', 'before', 'between', 'about',
  'through', 'during', 'without', 'again', 'further', 'once', 'here',
  'there', 'very', 'just', 'more', 'most', 'other', 'some', 'such',
  'only', 'same', 'also', 'back', 'even', 'still', 'well', 'made',
  'make', 'like', 'size', 'type', 'inch', 'large', 'small', 'medium',
  'pack', 'piece', 'count', 'style', 'color', 'white', 'black', 'blue',
  'pink', 'gray', 'grey', 'green', 'brown', 'multi'
]);

// Generate linkable keywords from products
export const generateProductKeywords = (products: Product[]): LinkableKeyword[] => {
  const keywords: LinkableKeyword[] = [];
  
  products.forEach((product) => {
    if (!product.name || !product.slug) return;
    
    const productUrl = `/products/${product.slug}`;
    const productNameLower = product.name.toLowerCase().trim();
    
    // Add full product name as keyword (highest priority)
    keywords.push({
      keyword: productNameLower,
      url: productUrl,
      type: 'product',
      priority: 10,
    });
    
    // Extract 2-3 word phrases from product name for better matching
    const words = productNameLower.split(/\s+/).filter(w => w.length >= 3);
    
    // Create 2-word combinations
    for (let i = 0; i < words.length - 1; i++) {
      const twoWordPhrase = `${words[i]} ${words[i + 1]}`;
      if (!stopWords.has(words[i]) && !stopWords.has(words[i + 1])) {
        keywords.push({
          keyword: twoWordPhrase,
          url: productUrl,
          type: 'product',
          priority: 7,
        });
      }
    }
    
    // Create 3-word combinations for more specific matches
    for (let i = 0; i < words.length - 2; i++) {
      const hasStopWord = [words[i], words[i + 1], words[i + 2]].some(w => stopWords.has(w));
      if (!hasStopWord) {
        const threeWordPhrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        keywords.push({
          keyword: threeWordPhrase,
          url: productUrl,
          type: 'product',
          priority: 8,
        });
      }
    }
    
    // Extract significant individual words (longer words, not stop words)
    words.forEach((word) => {
      if (word.length >= 6 && !stopWords.has(word)) {
        keywords.push({
          keyword: word,
          url: productUrl,
          type: 'product',
          priority: 3,
        });
      }
    });
  });
  
  return keywords;
};

// Generate linkable keywords from categories
export const generateCategoryKeywords = (categories: Category[]): LinkableKeyword[] => {
  const keywords: LinkableKeyword[] = [];
  
  categories.forEach((category) => {
    const categoryUrl = getCategoryCollectionUrl(category.slug);
    
    // Add category name
    keywords.push({
      keyword: category.name.toLowerCase(),
      url: categoryUrl,
      type: 'category',
      priority: 8,
    });
    
    // Add predefined keywords for this category
    const slug = category.slug.toLowerCase();
    const predefinedKeywords = categoryKeywords[slug] || [];
    predefinedKeywords.forEach((kw) => {
      keywords.push({
        keyword: kw.toLowerCase(),
        url: categoryUrl,
        type: 'category',
        priority: 6,
      });
    });
  });
  
  // Add fallback category keywords
  Object.entries(categoryKeywords).forEach(([slug, kws]) => {
    kws.forEach((kw) => {
      if (!keywords.some(k => k.keyword === kw.toLowerCase())) {
        keywords.push({
          keyword: kw.toLowerCase(),
          url: getCategoryCollectionUrl(slug),
          type: 'category',
          priority: 4,
        });
      }
    });
  });
  
  // Add product phrase keywords (high priority multi-word matches)
  Object.entries(productPhrases).forEach(([phrase, categorySlug]) => {
    keywords.push({
      keyword: phrase.toLowerCase(),
      url: getCategoryCollectionUrl(categorySlug),
      type: 'category',
      priority: 9, // High priority for specific phrases
    });
  });
  
  // Add SEO collection keywords (highest priority for dedicated landing pages)
  Object.entries(seoCollectionKeywords).forEach(([slug, kws]) => {
    kws.forEach((kw) => {
      keywords.push({
        keyword: kw.toLowerCase(),
        url: `/collections/${slug}`,
        type: 'category',
        priority: 10, // Highest priority for SEO collection pages
      });
    });
  });

  // ── Money Collection keywords (HIGHEST priority — revenue-tier weighted) ──
  for (const mc of MONEY_COLLECTIONS) {
    // Revenue tier multiplier: tier_1 = 1.4, tier_2 = 1.0, tier_3 = 0.7
    const tierMultiplier = getLinkWeightMultiplier(mc.slug);

    // Primary keyword → money collection URL
    keywords.push({
      keyword: mc.primaryKeyword.toLowerCase(),
      url: `/collections/${mc.slug}`,
      type: 'category',
      priority: Math.round(15 * tierMultiplier),
    });
    // Short name as anchor variant
    keywords.push({
      keyword: mc.shortName.toLowerCase(),
      url: `/collections/${mc.slug}`,
      type: 'category',
      priority: Math.round(13 * tierMultiplier),
    });
    // Description keywords (partial match phrases)
    const descWords = mc.description.toLowerCase().split(/[,.]/).map(s => s.trim()).filter(s => s.length > 10);
    for (const phrase of descWords.slice(0, 2)) {
      keywords.push({
        keyword: phrase,
        url: `/collections/${mc.slug}`,
        type: 'category',
        priority: Math.round(11 * tierMultiplier),
      });
    }
  }

  // ── Cornerstone sculpt keywords (high priority — authority flow) ──
  Object.entries(BLOG_CORNERSTONE_TRIGGERS).forEach(([trigger, targets]) => {
    targets.forEach(({ cornerstoneId }) => {
      const cs = PRIORITY_CORNERSTONES.find(c => c.id === cornerstoneId);
      if (!cs) return;
      const anchor = getCornerstoneAnchor(cornerstoneId, 'blog-inject');
      keywords.push({
        keyword: trigger.toLowerCase(),
        url: cs.path,
        type: 'cornerstone',
        priority: 12, // High priority — sculpt links
      });
    });
  });
  
  return keywords;
};

// Process HTML content and add internal links
export const addInternalLinks = (
  htmlContent: string,
  products: Product[],
  categories: Category[],
  options: {
    maxLinksPerKeyword?: number;
    maxTotalLinks?: number;
    minWordsBetweenLinks?: number;
  } = {}
): string => {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return '';
  }

  const {
    maxLinksPerKeyword = 2,
    maxTotalLinks = 20,
    minWordsBetweenLinks = 35,
  } = options;
  
  try {
    // Generate all linkable keywords
    const productKeywords = generateProductKeywords(products);
    const categoryKeywordsGenerated = generateCategoryKeywords(categories);
    
    // Combine and sort by priority (highest first) and length (longest first)
    const allKeywords = [...productKeywords, ...categoryKeywordsGenerated]
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.keyword.length - a.keyword.length;
      });
    
    // Track linked keywords and positions
    const linkedKeywords = new Map<string, number>();
    let totalLinksAdded = 0;
    let lastLinkPosition = -minWordsBetweenLinks;
    
    // Over-optimization guard: estimate word count, cap at 4 links per 1000 words
    const plainText = htmlContent.replace(/<[^>]+>/g, '');
    const wordCount = plainText.split(/\s+/).filter(Boolean).length;
    const maxByDensity = Math.max(4, Math.floor(wordCount / 150)); // ~6-7 per 1000
    const effectiveMax = Math.min(maxTotalLinks, maxByDensity);
    
    // Randomness factor: ±12% variation in placement spacing
    const randomFactor = 0.88 + Math.random() * 0.24; // 0.88–1.12
    const effectiveMinWords = Math.round(minWordsBetweenLinks * randomFactor);
    
    // Process content
    let processedContent = String(htmlContent);
    
    // Don't process if already saturated with links
    const existingLinkCount = (htmlContent.match(/<a\s/gi) || []).length;
    if (existingLinkCount > 15) {
      return htmlContent;
    }
    
    // Track anchor texts to prevent duplicates on same page
    const usedAnchors = new Set<string>();
    
    for (const { keyword, url, type } of allKeywords) {
      if (totalLinksAdded >= effectiveMax) break;
      
      const timesLinked = linkedKeywords.get(keyword) || 0;
      if (timesLinked >= maxLinksPerKeyword) continue;
      
      // Never repeat identical anchor text on same page
      if (usedAnchors.has(keyword.toLowerCase())) continue;
      
      // Create regex to match keyword (case insensitive, word boundaries)
      // Avoid matching inside existing tags or links
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(
        `(?<![<\\/a-zA-Z])\\b(${escapedKeyword})\\b(?![^<]*>)(?![^<]*<\\/a>)`,
        'gi'
      );
      
      // Find first match that's far enough from last link
      let match: RegExpExecArray | null;
      
      while ((match = regex.exec(processedContent)) !== null) {
        // Estimate word position (rough calculation)
        const textBeforeMatch = processedContent.substring(0, match.index).replace(/<[^>]+>/g, '');
        const wordPosition = textBeforeMatch.split(/\s+/).length;
        
        // Check if we're far enough from last link
        if (wordPosition - lastLinkPosition < effectiveMinWords) {
          continue;
        }
        
        // Check if we're inside a heading, link, code block, or FAQ schema block
        const beforeMatch = processedContent.substring(Math.max(0, match.index - 200), match.index);
        if (
          /<(h[1-6]|a|code|pre|script|style|span\s[^>]*itemscope)[^>]*>(?![^<]*<\/\1>)[^<]*$/i.test(beforeMatch) ||
          /<a\s[^>]*>[^<]*$/i.test(beforeMatch)
        ) {
          continue;
        }
        
        // Create the link - ensure match[1] is a string
        const matchedText = String(match[1] || keyword);
        const linkClass = type === 'cornerstone'
          ? 'internal-link internal-link-cornerstone'
          : type === 'product' 
            ? 'internal-link internal-link-product' 
            : 'internal-link internal-link-category';
        
        const replacement = `<a href="${url}" class="${linkClass}" data-internal-link="${type}">${matchedText}</a>`;
        
        // Replace only this occurrence
        processedContent = 
          processedContent.substring(0, match.index) + 
          replacement + 
          processedContent.substring(match.index + match[0].length);
        
        // Update tracking
        linkedKeywords.set(keyword, timesLinked + 1);
        usedAnchors.add(matchedText.toLowerCase());
        totalLinksAdded++;
        lastLinkPosition = wordPosition;
        break;
      }
    }
    
    return processedContent;
  } catch (error) {
    console.error('Error in addInternalLinks:', error);
    return htmlContent;
  }
};

// Process plain text/markdown content
export const addInternalLinksToText = (
  textContent: string,
  products: Product[],
  categories: Category[],
  options?: {
    maxLinksPerKeyword?: number;
    maxTotalLinks?: number;
  }
): string => {
  // For plain text, wrap in paragraph first
  const htmlContent = `<p>${textContent}</p>`;
  return addInternalLinks(htmlContent, products, categories, options);
};
