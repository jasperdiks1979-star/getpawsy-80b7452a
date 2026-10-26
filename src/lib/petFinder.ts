/** Rule-based (not AI) product finder over real eligible catalog rows. */
export type Pet = 'cat' | 'dog';
export type Need = 'litter' | 'play' | 'rest' | 'walk' | 'feed';
export type Budget = 'under50' | '50to100' | 'any';

export const NEEDS: Record<Pet, { id: Need; label: string }[]> = {
  cat: [
    { id: 'litter', label: 'Litter & clean-up' },
    { id: 'play', label: 'Play & scratching' },
    { id: 'rest', label: 'Rest & climbing' },
  ],
  dog: [
    { id: 'rest', label: 'Beds & rest' },
    { id: 'walk', label: 'Walks & travel' },
    { id: 'play', label: 'Toys & play' },
  ],
};

const KEYWORDS: Record<Need, string[]> = {
  litter: ['litter'],
  play: ['toy', 'scratch', 'teaser', 'puzzle', 'ball', 'chew', 'tunnel'],
  rest: ['bed', 'tree', 'condo', 'hammock', 'cushion', 'perch', 'tower', 'mat'],
  walk: ['leash', 'harness', 'collar', 'carrier', 'travel', 'stroller'],
  feed: ['bowl', 'feeder', 'fountain'],
};

export interface FinderRow {
  id: string; slug: string; name: string; price: number;
  image_url: string | null; stock: number | null; primary_species: string | null;
}

export function finderMatches(rows: FinderRow[], pet: Pet, need: Need, budget: Budget, limit = 4): FinderRow[] {
  const kw = KEYWORDS[need];
  return rows
    .filter((r) => Number(r.stock) > 0 && r.image_url && r.slug)
    .filter((r) => r.primary_species === pet || r.primary_species === 'both')
    .filter((r) => {
      const n = r.name.toLowerCase();
      if (need !== 'litter' && n.includes('litter')) return false;
      return kw.some((k) => n.includes(k));
    })
    .filter((r) => budget === 'any' || (budget === 'under50' ? r.price < 50 : r.price >= 50 && r.price <= 100))
    .slice(0, limit);
}
