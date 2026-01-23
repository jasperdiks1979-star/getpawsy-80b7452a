/**
 * Fuzzy Search & Synonym Matching Utility
 * 
 * Provides fuzzy text matching with typo tolerance and synonym expansion
 * for improved search results. Supports both English and Dutch terms
 * to help users find products regardless of language used in search.
 */

// Pet-related synonyms mapping (supports bilingual search)
const SYNONYMS: Record<string, string[]> = {
  // Animals
  'dog': ['hond', 'puppy', 'pup', 'canine', 'honden', 'puppies'],
  'hond': ['dog', 'puppy', 'pup', 'canine', 'honden', 'puppies'],
  'cat': ['kat', 'kitten', 'poes', 'katten', 'kittens', 'feline'],
  'kat': ['cat', 'kitten', 'poes', 'katten', 'kittens', 'feline'],
  'bird': ['vogel', 'parrot', 'papegaai', 'vogels', 'birds'],
  'vogel': ['bird', 'parrot', 'papegaai', 'vogels', 'birds'],
  'fish': ['vis', 'aquarium', 'vissen', 'fishes'],
  'vis': ['fish', 'aquarium', 'vissen', 'fishes'],
  'rabbit': ['konijn', 'bunny', 'konijnen', 'rabbits'],
  'konijn': ['rabbit', 'bunny', 'konijnen', 'rabbits'],
  'hamster': ['hamsters', 'knaagdier', 'rodent'],
  'guinea pig': ['cavia', 'guinea pigs', 'cavias'],
  'cavia': ['guinea pig', 'guinea pigs', 'cavias'],
  'reptile': ['reptiel', 'lizard', 'hagedis', 'snake', 'slang'],
  'reptiel': ['reptile', 'lizard', 'hagedis', 'snake', 'slang'],
  
  // Products
  'bed': ['mand', 'kussen', 'slaapplaats', 'beds', 'cushion', 'pillow'],
  'mand': ['bed', 'basket', 'beds', 'baskets'],
  'toy': ['speelgoed', 'speeltje', 'toys', 'speeltjes'],
  'speelgoed': ['toy', 'toys', 'speeltje', 'speeltjes'],
  'food': ['voer', 'eten', 'voeding', 'foods', 'snack', 'treat'],
  'voer': ['food', 'eten', 'voeding', 'foods', 'snack', 'treat'],
  'collar': ['halsband', 'collars', 'halsbanden'],
  'halsband': ['collar', 'collars', 'halsbanden'],
  'leash': ['riem', 'lijn', 'leashes', 'riemen'],
  'riem': ['leash', 'lijn', 'leashes', 'riemen'],
  'bowl': ['bak', 'kom', 'voerbak', 'bowls', 'bakken'],
  'bak': ['bowl', 'kom', 'voerbak', 'bowls', 'bakken'],
  'cage': ['kooi', 'hok', 'cages', 'kooien'],
  'kooi': ['cage', 'hok', 'cages', 'kooien'],
  'carrier': ['transportbox', 'draagtas', 'carriers', 'reismand'],
  'transportbox': ['carrier', 'draagtas', 'carriers', 'reismand'],
  'brush': ['borstel', 'kam', 'grooming', 'verzorging'],
  'borstel': ['brush', 'kam', 'grooming', 'verzorging'],
  'litter': ['kattenbak', 'strooisel', 'litter box'],
  'kattenbak': ['litter', 'litter box', 'strooisel'],
  'scratching': ['krab', 'krabpaal', 'scratch', 'scratching post'],
  'krabpaal': ['scratching', 'scratching post', 'krab', 'scratch'],
  'house': ['huis', 'huisje', 'hok', 'houses'],
  'huisje': ['house', 'huis', 'hok', 'houses'],
  'fountain': ['fontein', 'drinkfontein', 'water fountain'],
  'fontein': ['fountain', 'drinkfontein', 'water fountain'],
  'feeder': ['voerbak', 'automatische voerbak', 'feeders'],
  'gps': ['tracker', 'tracking', 'locatie'],
  'tracker': ['gps', 'tracking', 'locatie'],
  
  // Attributes
  'automatic': ['automatisch', 'auto'],
  'automatisch': ['automatic', 'auto'],
  'interactive': ['interactief', 'smart', 'slim'],
  'interactief': ['interactive', 'smart', 'slim'],
  'outdoor': ['buiten', 'outside', 'buitenshuis'],
  'buiten': ['outdoor', 'outside', 'buitenshuis'],
  'indoor': ['binnen', 'inside', 'binnenshuis'],
  'binnen': ['indoor', 'inside', 'binnenshuis'],
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
