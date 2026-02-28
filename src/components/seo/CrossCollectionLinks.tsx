/**
 * Cross-Collection Links — shows related money collections on collection pages.
 * Phase 5: Contextual cross-links between related commercial collections.
 */

import { Link } from 'react-router-dom';
import { getMoneyCollection, MONEY_COLLECTIONS, type MoneyCollection } from '@/lib/money-collections';

interface CrossCollectionLinksProps {
  currentSlug: string;
}

export function CrossCollectionLinks({ currentSlug }: CrossCollectionLinksProps) {
  const current = getMoneyCollection(currentSlug);
  
  // Get cross-links from current collection, or show top collections from opposite species
  let related: MoneyCollection[] = [];
  
  if (current?.crossLinks?.length) {
    related = current.crossLinks
      .map(slug => getMoneyCollection(slug))
      .filter((mc): mc is MoneyCollection => !!mc)
      .slice(0, 3);
  }
  
  // If no cross-links defined, show 2 from same species + 1 from other
  if (related.length === 0) {
    const species = currentSlug.includes('cat') ? 'cat' : 'dog';
    const otherSpecies = species === 'cat' ? 'dog' : 'cat';
    related = [
      ...MONEY_COLLECTIONS.filter(mc => mc.cluster === species && mc.slug !== currentSlug).slice(0, 2),
      ...MONEY_COLLECTIONS.filter(mc => mc.cluster === otherSpecies).slice(0, 1),
    ];
  }

  if (related.length === 0) return null;

  return (
    <section className="mt-8 md:mt-12 pt-6 border-t border-border/40">
      <h3 className="text-lg font-display font-semibold mb-4">
        Related Collections You Might Like
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {related.map(mc => (
          <Link
            key={mc.slug}
            to={`/collections/${mc.slug}`}
            className="group flex items-start gap-3 p-4 rounded-xl border border-border/50 bg-card hover:border-primary/30 hover:shadow-sm transition-all"
          >
            <span className="text-2xl">{mc.icon}</span>
            <div className="min-w-0">
              <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors block">
                {mc.shortName}
              </span>
              <span className="text-xs text-muted-foreground line-clamp-2">
                {mc.description}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
