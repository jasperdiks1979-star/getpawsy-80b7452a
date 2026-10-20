import { classifySpecies } from './species-taxonomy';

export type SpeciesTarget = 'cat' | 'dog' | 'multi';

/** Which species presentation a collection slug implies (null = no guard). */
export function collectionSpeciesTarget(slug: string | null | undefined): SpeciesTarget | null {
  if (!slug) return null;
  if (slug === 'multi-pet') return 'multi';
  if (slug === 'cat' || slug === 'cats' || slug.startsWith('cat-')) return 'cat';
  if (slug === 'dog' || slug === 'dogs' || slug.startsWith('dog-') || slug.startsWith('puppy-')) return 'dog';
  return null;
}

interface GuardProduct {
  name: string;
  category?: string | null;
  primary_species?: string | null;
}

/**
 * Species presentation guard. Single-species pages show only that species;
 * multi-pet ("both") items appear only when the shopper opts in. Nothing is
 * removed from the catalog — this filters presentation only.
 */
export function applySpeciesGuard<T extends GuardProduct>(
  products: T[],
  target: SpeciesTarget | null,
  includeMultiPet: boolean,
): T[] {
  if (!target) return products;
  if (target === 'multi') {
    return products.filter(p => {
      if (p.primary_species) return p.primary_species === 'both';
      return classifySpecies(p.name, p.category || '', []).speciesPrimary === 'multi';
    });
  }
  const opposite = target === 'cat' ? 'dog' : 'cat';
  const oppositeKeywords = opposite === 'dog'
    ? ['dog collar', 'dog leash', 'dog harness', 'dog training', 'dog bed', 'dog toy', 'dog crate', 'dog car']
    : ['cat tree', 'cat litter', 'cat condo', 'cat tower', 'cat scratching', 'cat furniture'];
  return products.filter(p => {
    const category = (p.category || '').toLowerCase();
    if (oppositeKeywords.some(kw => category.includes(kw))) return false;
    const db = p.primary_species;
    const species = db && db !== 'unknown'
      ? (db === 'both' ? 'multi' : db)
      : classifySpecies(p.name.toLowerCase(), category, []).speciesPrimary;
    if (species === target) return true;
    if (species === 'multi') return includeMultiPet;
    return false;
  });
}
