/**
 * Fuzzy Search & Synonym Matching Utility
 * 
 * Provides fuzzy text matching with typo tolerance and synonym expansion
 * for improved search results. Supports both English and Dutch terms
 * to help users find products regardless of language used in search.
 */

// Pet-related synonyms mapping (supports bilingual search)
const SYNONYMS: Record<string, string[]> = {
  // === ANIMALS ===
  'dog': ['hond', 'puppy', 'pup', 'canine', 'honden', 'puppies', 'pooch', 'doggy', 'doggie', 'pups'],
  'hond': ['dog', 'puppy', 'pup', 'canine', 'honden', 'puppies', 'pooch', 'doggy'],
  'cat': ['kat', 'kitten', 'poes', 'katten', 'kittens', 'feline', 'kitty', 'kitties', 'cats'],
  'kat': ['cat', 'kitten', 'poes', 'katten', 'kittens', 'feline', 'kitty'],
  'bird': ['vogel', 'parrot', 'papegaai', 'vogels', 'birds', 'parakeet', 'budgie', 'cockatiel', 'canary', 'finch'],
  'vogel': ['bird', 'parrot', 'papegaai', 'vogels', 'birds', 'parakeet', 'budgie'],
  'fish': ['vis', 'aquarium', 'vissen', 'fishes', 'tropical', 'goldfish', 'betta', 'guppy', 'tetra'],
  'vis': ['fish', 'aquarium', 'vissen', 'fishes', 'tropical'],
  'rabbit': ['konijn', 'bunny', 'konijnen', 'rabbits', 'bunnies', 'hare'],
  'konijn': ['rabbit', 'bunny', 'konijnen', 'rabbits', 'bunnies'],
  'hamster': ['hamsters', 'knaagdier', 'rodent', 'dwarf hamster', 'syrian'],
  'guinea pig': ['cavia', 'guinea pigs', 'cavias', 'cavy', 'cavies'],
  'cavia': ['guinea pig', 'guinea pigs', 'cavias', 'cavy'],
  'reptile': ['reptiel', 'lizard', 'hagedis', 'snake', 'slang', 'gecko', 'turtle', 'tortoise', 'bearded dragon', 'iguana'],
  'reptiel': ['reptile', 'lizard', 'hagedis', 'snake', 'slang', 'gecko'],
  
  // === BEDS & SLEEPING ===
  'bed': ['mand', 'kussen', 'slaapplaats', 'beds', 'cushion', 'pillow', 'mattress', 'sleeping', 'cozy', 'nest', 'donut bed', 'orthopedic'],
  'mand': ['bed', 'basket', 'beds', 'baskets'],
  'cushion': ['pillow', 'pad', 'mat', 'kussen', 'bedding'],
  'blanket': ['throw', 'fleece', 'cover', 'deken', 'blankets'],
  
  // === TOYS & PLAY ===
  'toy': ['speelgoed', 'speeltje', 'toys', 'speeltjes', 'plaything', 'chew', 'squeaky', 'plush', 'ball', 'rope'],
  'speelgood': ['toy', 'toys', 'speeltje', 'speeltjes'],
  'ball': ['balls', 'fetch', 'tennis ball', 'chew ball'],
  'chew': ['chews', 'chewing', 'gnaw', 'teething', 'dental toy'],
  'plush': ['stuffed', 'soft toy', 'cuddly', 'squeaky'],
  'puzzle': ['interactive', 'brain', 'mental', 'enrichment', 'stimulation'],
  
  // === FOOD & FEEDING ===
  'food': ['voer', 'eten', 'voeding', 'foods', 'snack', 'treat', 'kibble', 'wet food', 'dry food', 'nutrition', 'diet', 'meal'],
  'voer': ['food', 'eten', 'voeding', 'foods', 'snack', 'treat'],
  'treat': ['treats', 'snack', 'snacks', 'reward', 'biscuit', 'jerky', 'dental treat'],
  'bowl': ['bak', 'kom', 'voerbak', 'bowls', 'bakken', 'dish', 'feeder', 'water bowl', 'food bowl'],
  'bak': ['bowl', 'kom', 'voerbak', 'bowls', 'bakken', 'dish'],
  'feeder': ['voerbak', 'automatische voerbak', 'feeders', 'dispenser', 'automatic feeder', 'slow feeder', 'puzzle feeder'],
  'fountain': ['fontein', 'drinkfontein', 'water fountain', 'drinking', 'water dispenser'],
  'fontein': ['fountain', 'drinkfontein', 'water fountain'],
  
  // === COLLARS & LEASHES ===
  'collar': ['halsband', 'collars', 'halsbanden', 'necklace', 'neck', 'tag collar', 'breakaway'],
  'halsband': ['collar', 'collars', 'halsbanden'],
  'leash': ['riem', 'lijn', 'leashes', 'riemen', 'lead', 'leads', 'walking', 'retractable'],
  'riem': ['leash', 'lijn', 'leashes', 'riemen', 'lead'],
  'harness': ['harnesses', 'vest', 'body harness', 'no-pull', 'step-in', 'tuig'],
  
  // === HOUSING & CAGES ===
  'cage': ['kooi', 'hok', 'cages', 'kooien', 'enclosure', 'habitat', 'hutch', 'pen', 'crate'],
  'kooi': ['cage', 'hok', 'cages', 'kooien', 'enclosure'],
  'carrier': ['transportbox', 'draagtas', 'carriers', 'reismand', 'crate', 'travel', 'transport', 'pet bag', 'backpack carrier'],
  'transportbox': ['carrier', 'draagtas', 'carriers', 'reismand', 'crate'],
  'house': ['huis', 'huisje', 'hok', 'houses', 'shelter', 'hideout', 'hideaway', 'igloo', 'den'],
  'huisje': ['house', 'huis', 'hok', 'houses', 'shelter'],
  'crate': ['kennel', 'carrier', 'cage', 'travel crate', 'wire crate'],
  'tank': ['aquarium', 'terrarium', 'vivarium', 'enclosure'],
  
  // === GROOMING & CARE ===
  'brush': ['borstel', 'kam', 'grooming', 'verzorging', 'comb', 'deshedding', 'slicker', 'bristle'],
  'borstel': ['brush', 'kam', 'grooming', 'verzorging', 'comb'],
  'shampoo': ['wash', 'bath', 'soap', 'cleanser', 'conditioner', 'bathing'],
  'nail': ['nails', 'claw', 'claws', 'trimmer', 'clipper', 'grinder'],
  'grooming': ['care', 'hygiene', 'cleaning', 'maintenance', 'verzorging'],
  
  // === CAT-SPECIFIC ===
  'litter': ['kattenbak', 'strooisel', 'litter box', 'cat litter', 'kitty litter', 'sand'],
  'kattenbak': ['litter', 'litter box', 'strooisel'],
  'scratching': ['krab', 'krabpaal', 'scratch', 'scratching post', 'scratcher', 'scratch pad', 'sisal'],
  'krabpaal': ['scratching', 'scratching post', 'krab', 'scratch', 'cat tree'],
  'cat tree': ['krabpaal', 'climbing', 'tower', 'condo', 'perch', 'cat furniture', 'activity center'],
  'catnip': ['catmint', 'cat grass', 'silvervine'],
  
  // === TECH & ACCESSORIES ===
  'gps': ['tracker', 'tracking', 'locatie', 'location', 'finder', 'smart tag', 'airtag'],
  'tracker': ['gps', 'tracking', 'locatie', 'location', 'finder'],
  'camera': ['monitor', 'pet cam', 'webcam', 'surveillance', 'treat cam'],
  'smart': ['automatic', 'electronic', 'wifi', 'app', 'connected', 'intelligent'],
  
  // === HEALTH & SAFETY ===
  'medicine': ['medication', 'supplement', 'vitamin', 'health', 'wellness'],
  'flea': ['tick', 'pest', 'parasite', 'prevention', 'treatment'],
  'dental': ['teeth', 'oral', 'toothbrush', 'toothpaste', 'chew'],
  'calming': ['anxiety', 'stress', 'relaxing', 'soothing', 'comfort'],
  
  // === TRAINING ===
  'training': ['train', 'obedience', 'behavior', 'learning', 'clicker'],
  'potty': ['toilet', 'pee pad', 'training pad', 'housebreaking', 'puppy pad'],
  'clicker': ['training', 'positive reinforcement', 'reward'],
  
  // === TRAVEL & OUTDOOR ===
  'travel': ['trip', 'journey', 'car', 'airplane', 'portable', 'on-the-go'],
  'stroller': ['buggy', 'pushchair', 'pet pram', 'carrier', 'wagon'],
  'outdoor': ['buiten', 'outside', 'buitenshuis', 'garden', 'yard', 'patio', 'weatherproof'],
  'buiten': ['outdoor', 'outside', 'buitenshuis', 'garden'],
  'indoor': ['binnen', 'inside', 'binnenshuis', 'home', 'house'],
  'binnen': ['indoor', 'inside', 'binnenshuis', 'home'],
  
  // === ATTRIBUTES ===
  'automatic': ['automatisch', 'auto', 'self', 'programmable', 'timed'],
  'automatisch': ['automatic', 'auto', 'self'],
  'interactive': ['interactief', 'smart', 'slim', 'electronic', 'motion', 'sensor'],
  'interactief': ['interactive', 'smart', 'slim'],
  'large': ['big', 'xl', 'extra large', 'giant', 'jumbo', 'groot'],
  'small': ['mini', 'tiny', 'xs', 'extra small', 'petite', 'klein'],
  'medium': ['mid', 'regular', 'standard', 'average'],
  'waterproof': ['water resistant', 'weatherproof', 'rainproof', 'splash proof'],
  'washable': ['machine wash', 'cleanable', 'removable cover'],
};

// Calculate Levenshtein distance between two strings
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

// Calculate similarity score (0-1, higher is better)
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  // Exact match
  if (s1 === s2) return 1;
  
  // Contains match
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.9;
  }
  
  // Word start match
  if (s1.startsWith(s2) || s2.startsWith(s1)) {
    return 0.85;
  }
  
  // Fuzzy match using Levenshtein
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(s1, s2);
  const similarity = 1 - distance / maxLen;
  
  return similarity;
}

// Get synonyms for a word
export function getSynonyms(word: string): string[] {
  const lowerWord = word.toLowerCase();
  const directSynonyms = SYNONYMS[lowerWord] || [];
  
  // Also check if word is a synonym of something else
  const reverseSynonyms: string[] = [];
  for (const [key, values] of Object.entries(SYNONYMS)) {
    if (values.includes(lowerWord) && !directSynonyms.includes(key)) {
      reverseSynonyms.push(key);
    }
  }
  
  return [...new Set([...directSynonyms, ...reverseSynonyms])];
}

// Expand search query with synonyms
export function expandQueryWithSynonyms(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const expanded = new Set<string>(words);
  
  for (const word of words) {
    const synonyms = getSynonyms(word);
    synonyms.forEach(syn => expanded.add(syn));
  }
  
  return Array.from(expanded);
}

// Calculate match score for a product/category against search terms
export function calculateMatchScore(
  text: string,
  searchTerms: string[],
  expandedTerms: string[]
): number {
  const lowerText = text.toLowerCase();
  let score = 0;
  
  // Exact word matches (highest priority)
  for (const term of searchTerms) {
    if (lowerText.includes(term)) {
      score += 100;
      // Bonus for word boundary match
      if (new RegExp(`\\b${term}\\b`, 'i').test(lowerText)) {
        score += 50;
      }
    }
  }
  
  // Synonym matches (medium priority)
  for (const term of expandedTerms) {
    if (!searchTerms.includes(term) && lowerText.includes(term)) {
      score += 60;
    }
  }
  
  // Fuzzy matches for typos (lower priority)
  const textWords = lowerText.split(/[\s\-_]+/);
  for (const term of searchTerms) {
    for (const textWord of textWords) {
      const similarity = calculateSimilarity(term, textWord);
      if (similarity >= 0.7 && similarity < 1) {
        score += similarity * 40;
      }
    }
  }
  
  return score;
}

interface ScoredItem<T> {
  item: T;
  score: number;
}

// Find best matching items with scores
export function findBestMatches<T>(
  items: T[],
  searchQuery: string,
  getSearchableText: (item: T) => string,
  maxResults: number = 6
): T[] {
  if (!searchQuery.trim()) return [];
  
  const searchTerms = searchQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (searchTerms.length === 0) return [];
  
  const expandedTerms = expandQueryWithSynonyms(searchQuery);
  
  const scoredItems: ScoredItem<T>[] = items
    .map(item => ({
      item,
      score: calculateMatchScore(getSearchableText(item), searchTerms, expandedTerms)
    }))
    .filter(scored => scored.score > 0)
    .sort((a, b) => b.score - a.score);
  
  return scoredItems.slice(0, maxResults).map(s => s.item);
}

// Check if any search term has a fuzzy match in text
export function hasFuzzyMatch(text: string, searchTerms: string[], threshold: number = 0.7): boolean {
  const lowerText = text.toLowerCase();
  const textWords = lowerText.split(/[\s\-_]+/);
  
  for (const term of searchTerms) {
    // Direct match
    if (lowerText.includes(term)) return true;
    
    // Fuzzy match
    for (const textWord of textWords) {
      if (calculateSimilarity(term, textWord) >= threshold) {
        return true;
      }
    }
    
    // Synonym match
    const synonyms = getSynonyms(term);
    for (const syn of synonyms) {
      if (lowerText.includes(syn)) return true;
    }
  }
  
  return false;
}
