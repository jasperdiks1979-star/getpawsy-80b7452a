/**
 * Species Taxonomy Classifier v2
 * 
 * Deterministic, rule-based classifier for pet products.
 * Assigns speciesPrimary: "cat" | "dog" | "multi" | "unknown"
 * based on title, category, and tags signals.
 * 
 * v2 changes: "both" → "multi", added confidence + reasons, low-confidence → multi
 */

const DOG_SIGNALS = [
  'dog', 'puppy', 'canine', 'leash', 'harness', 'collar',
  'training rope', 'potty pad', 'dog bed', 'dog crate',
  'dog toy', 'dog bowl', 'dog treat', 'dog food',
  'chew toy', 'fetch', 'dog car seat', 'dog booster',
  'dog carrier', 'pup', 'bark', 'no-pull',
];

const CAT_SIGNALS = [
  'cat', 'kitten', 'feline', 'litter', 'scratching',
  'catnip', 'cat tree', 'cat tower', 'cat condo',
  'cat bed', 'cat toy', 'cat food', 'cat treat',
  'whisker', 'mouse toy', 'laser toy', 'cat fountain',
  'sisal', 'cat perch', 'cat shelf', 'kitty',
];

// Phrases that explicitly indicate multi-pet products
const MULTI_PET_PHRASES = [
  'dog and cat', 'cat and dog', 'dogs and cats', 'cats and dogs',
  'dog & cat', 'cat & dog', 'dogs & cats', 'cats & dogs',
  'for dogs and cats', 'for cats and dogs',
  'pet bowl', 'pet bed', 'pet carrier', 'pet fountain',
  'all pets', 'multi-pet', 'dog cat',
];

export interface SpeciesSignals {
  titleHits: string[];
  categoryHits: string[];
  tagsHits: string[];
}

export interface TaxonomyResult {
  speciesPrimary: 'cat' | 'dog' | 'multi' | 'unknown';
  speciesSignals: SpeciesSignals;
  speciesReasons: string[];
  speciesConfidence: number;
  dogScore: number;
  catScore: number;
  taxonomyVersion: number;
}

const TAXONOMY_VERSION = 2;

function findSignals(text: string, signals: string[]): string[] {
  const lower = text.toLowerCase();
  return signals.filter(signal => {
    // Word-boundary match to avoid false positives like "catalog" matching "cat"
    const regex = new RegExp(`\\b${signal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return regex.test(lower);
  });
}

function hasMultiPetPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return MULTI_PET_PHRASES.some(phrase => lower.includes(phrase));
}

/**
 * Classify a product's species from its metadata.
 * Pure, deterministic — no side effects.
 */
export function classifySpecies(
  title: string,
  category: string = '',
  tags: string[] = [],
): TaxonomyResult {
  const allText = [title, category, ...tags].join(' ');
  const reasons: string[] = [];
  
  // Check for explicit multi-pet phrases first
  const isExplicitlyMultiPet = hasMultiPetPhrase(allText);

  const titleDogHits = findSignals(title, DOG_SIGNALS);
  const titleCatHits = findSignals(title, CAT_SIGNALS);
  const categoryDogHits = findSignals(category, DOG_SIGNALS);
  const categoryCatHits = findSignals(category, CAT_SIGNALS);
  const tagsDogHits = findSignals(tags.join(' '), DOG_SIGNALS);
  const tagsCatHits = findSignals(tags.join(' '), CAT_SIGNALS);

  const speciesSignals: SpeciesSignals = {
    titleHits: [...titleDogHits, ...titleCatHits],
    categoryHits: [...categoryDogHits, ...categoryCatHits],
    tagsHits: [...tagsDogHits, ...tagsCatHits],
  };

  // Score: title hits count 2x, category 1.5x, tags 1x
  const dogScore = titleDogHits.length * 2 + categoryDogHits.length * 1.5 + tagsDogHits.length;
  const catScore = titleCatHits.length * 2 + categoryCatHits.length * 1.5 + tagsCatHits.length;

  let speciesPrimary: TaxonomyResult['speciesPrimary'];
  let confidence: number;

  if (isExplicitlyMultiPet) {
    speciesPrimary = 'multi';
    confidence = 0.95;
    reasons.push('explicit_multi_pet_phrase');
  } else if (dogScore > 0 && catScore > 0) {
    speciesPrimary = 'multi';
    confidence = 0.8;
    reasons.push('both_species_signals_present');
  } else if (dogScore > 0) {
    speciesPrimary = 'dog';
    // Higher score = higher confidence, cap at 1.0
    confidence = Math.min(1.0, 0.6 + dogScore * 0.1);
    reasons.push(...titleDogHits.map(h => `title:${h}`));
    reasons.push(...categoryDogHits.map(h => `category:${h}`));
    reasons.push(...tagsDogHits.map(h => `tag:${h}`));
  } else if (catScore > 0) {
    speciesPrimary = 'cat';
    confidence = Math.min(1.0, 0.6 + catScore * 0.1);
    reasons.push(...titleCatHits.map(h => `title:${h}`));
    reasons.push(...categoryCatHits.map(h => `category:${h}`));
    reasons.push(...tagsCatHits.map(h => `tag:${h}`));
  } else {
    speciesPrimary = 'unknown';
    confidence = 0;
    reasons.push('no_species_signals');
  }

  // Low-confidence guard: if single-species but confidence < 0.6, treat as multi
  if ((speciesPrimary === 'dog' || speciesPrimary === 'cat') && confidence < 0.6) {
    speciesPrimary = 'multi';
    reasons.push('low_confidence_fallback');
  }

  return {
    speciesPrimary,
    speciesSignals,
    speciesReasons: reasons,
    speciesConfidence: confidence,
    dogScore,
    catScore,
    taxonomyVersion: TAXONOMY_VERSION,
  };
}

/**
 * Filter products for a species collection.
 * Returns products matching the target species.
 * When includeMultiPet=true, also includes speciesPrimary="multi".
 */
export function filterProductsBySpecies<T extends { name: string; category?: string | null; tags?: string[] | null }>(
  products: T[],
  targetSpecies: 'cat' | 'dog',
  includeMultiPet = false,
): (T & { _taxonomy: TaxonomyResult })[] {
  return products
    .map(p => ({
      ...p,
      _taxonomy: classifySpecies(p.name, p.category || '', p.tags || []),
    }))
    .filter(p => {
      if (p._taxonomy.speciesPrimary === targetSpecies) return true;
      if (includeMultiPet && p._taxonomy.speciesPrimary === 'multi') return true;
      return false;
    });
}
