/**
 * Related-guide selection for PDPs. A guide that is clearly about the other
 * species (e.g. a dog-toy guide on a cat-toy page) is never shown; generic
 * "toys" keyword overlap used to pull dog guides onto cat products.
 */
export interface GuideLike {
  slug?: string;
  title?: string;
  category?: string;
  keywords?: string[];
  relatedCategories?: string[];
}

type Species = 'dog' | 'cat' | '';

const speciesOf = (text: string): Species => {
  const t = text.toLowerCase();
  const dog = /\b(dogs?|pupp(y|ies)|canine)\b/.test(t);
  const cat = /\b(cats?|kittens?|kitty|feline)\b/.test(t);
  if (dog && !cat) return 'dog';
  if (cat && !dog) return 'cat';
  return '';
};

export function selectRelatedGuides<G extends GuideLike>(guides: G[], category: string, primarySpecies?: string | null, limit = 4): G[] {
  const cat = category.toLowerCase().replace(/-/g, ' ');
  const species: Species = primarySpecies === 'dog' || primarySpecies === 'cat' ? primarySpecies : speciesOf(cat);
  return guides
    .filter((g) => {
      if (species) {
        const gs = speciesOf(`${g.title ?? ''} ${g.category ?? ''} ${g.slug ?? ''}`.replace(/-/g, ' '));
        if (gs && gs !== species) return false;
      }
      const catMatch = g.relatedCategories?.some((rc) => {
        const rcNorm = rc.replace(/-/g, ' ').toLowerCase();
        return cat.includes(rcNorm) || rcNorm.includes(cat);
      });
      if (catMatch) return true;
      const kwMatch = g.keywords?.some((kw) => cat.split(' ').some((w) => w.length > 3 && kw.toLowerCase().includes(w)));
      if (kwMatch) return true;
      if (species && g.category?.toLowerCase().includes(species)) {
        const gc = g.category.toLowerCase();
        return cat.split(' ').some((w) => w.length > 3 && gc.includes(w));
      }
      return false;
    })
    .slice(0, limit);
}
