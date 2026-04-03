/**
 * PDPClusterLinks — Universal internal linking block for all product detail pages.
 * Links back to parent collection hub + related guides from the money collections system.
 * Replaces the need for per-category cluster link components.
 */

import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, ShoppingBag } from 'lucide-react';
import { MONEY_COLLECTIONS, type MoneyCollection } from '@/lib/money-collections';

interface PDPClusterLinksProps {
  productCategory: string | null;
  productName: string;
}

function findBestCollection(category: string | null, name: string): MoneyCollection | null {
  const text = `${category || ''} ${name}`.toLowerCase();
  let best: MoneyCollection | null = null;
  let bestScore = 0;

  for (const mc of MONEY_COLLECTIONS) {
    let score = 0;
    const kw = mc.primaryKeyword.toLowerCase();
    if (text.includes(kw)) score += 10;

    const catLower = (category || '').toLowerCase();
    if (mc.slug.includes(catLower.replace(/\s+/g, '-'))) score += 5;
    if (catLower.includes('cat') && mc.cluster === 'cat') score += 2;
    if (catLower.includes('dog') && mc.cluster === 'dog') score += 2;
    if (catLower.includes('tree') && mc.slug.includes('tree')) score += 4;
    if (catLower.includes('litter') && mc.slug.includes('litter')) score += 4;
    if (catLower.includes('bed') && mc.slug.includes('bed')) score += 4;
    if (catLower.includes('travel') && mc.slug.includes('travel')) score += 4;
    if (catLower.includes('stroller') && mc.slug.includes('stroller')) score += 4;
    if (catLower.includes('harness') && mc.slug.includes('harness')) score += 4;

    const nameWords = mc.shortName.toLowerCase().split(' ');
    for (const w of nameWords) {
      if (w.length > 3 && text.includes(w)) score += 3;
    }

    if (score > bestScore) {
      best = mc;
      bestScore = score;
    }
  }

  return bestScore > 2 ? best : null;
}

// Anchor text variations to avoid exact-match spam
const collectionAnchors = [
  (name: string) => `Browse all ${name}`,
  (name: string) => `Shop ${name} collection`,
  (name: string) => `See more ${name}`,
];

const guideAnchors = [
  (title: string) => title,
  (title: string) => `Read: ${title}`,
  (title: string) => `Guide: ${title}`,
];

export function PDPClusterLinks({ productCategory, productName }: PDPClusterLinksProps) {
  const collection = findBestCollection(productCategory, productName);
  if (!collection) return null;

  const crossLinks = collection.crossLinks
    .map(slug => MONEY_COLLECTIONS.find(mc => mc.slug === slug))
    .filter(Boolean)
    .slice(0, 2);

  const guideLinks = collection.supportArticles.slice(0, 3);

  return (
    <section className="mt-12 pt-8 border-t border-border/40" aria-label="Related content">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Collection Links */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <ShoppingBag className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Shop Related Collections</h3>
          </div>
          <div className="space-y-2">
            <Link
              to={`/collections/${collection.slug}`}
              className="group flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
            >
              <span className="text-lg">{collection.icon}</span>
              <span className="font-medium">
                {collectionAnchors[0](collection.shortName)}
              </span>
              <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
            {crossLinks.map((mc, i) => (
              <Link
                key={mc!.slug}
                to={`/collections/${mc!.slug}`}
                className="group flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <span className="text-lg">{mc!.icon}</span>
                <span>{collectionAnchors[(i + 1) % collectionAnchors.length](mc!.shortName)}</span>
                <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>
        </div>

        {/* Guide Links */}
        {guideLinks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-4 h-4 text-primary" />
              <h3 className="font-display font-semibold text-sm">Helpful Guides</h3>
            </div>
            <div className="space-y-2">
              {guideLinks.map((slug, i) => {
                const title = slug
                  .replace(/-/g, ' ')
                  .replace(/\b\w/g, c => c.toUpperCase())
                  .replace(/\d{4}$/, '')
                  .trim();
                return (
                  <Link
                    key={slug}
                    to={`/guides/${slug}`}
                    className="group flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    <span className="text-primary/60">→</span>
                    <span>{guideAnchors[i % guideAnchors.length](title)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
