/**
 * Product Page Cross-Linking Component
 * Phase 4: Links back to parent collection + related products + contextual cross-link.
 */

import { Link } from 'react-router-dom';
import { MONEY_COLLECTIONS } from '@/lib/money-collections';
import { ArrowRight } from 'lucide-react';

interface ProductPageCrossLinksProps {
  productCategory: string | null;
  productName: string;
}

/** Infer the best parent collection from product category/name */
function inferParentCollection(category: string | null, name: string) {
  const text = `${category || ''} ${name}`.toLowerCase();
  
  // Score each money collection
  let best: { slug: string; name: string; score: number } | null = null;
  
  for (const mc of MONEY_COLLECTIONS) {
    let score = 0;
    const kw = mc.primaryKeyword.toLowerCase();
    if (text.includes(kw)) score += 10;
    
    // Check category match
    const catLower = (category || '').toLowerCase();
    if (mc.slug.includes(catLower.replace(/\s+/g, '-'))) score += 5;
    if (catLower.includes('cat') && mc.cluster === 'cat') score += 2;
    if (catLower.includes('dog') && mc.cluster === 'dog') score += 2;
    
    // Check name keywords
    const nameWords = mc.shortName.toLowerCase().split(' ');
    for (const w of nameWords) {
      if (w.length > 3 && text.includes(w)) score += 3;
    }
    
    if (!best || score > best.score) {
      best = { slug: mc.slug, name: mc.shortName, score };
    }
  }
  
  return best && best.score > 2 ? best : null;
}

export function ProductPageCrossLinks({ productCategory, productName }: ProductPageCrossLinksProps) {
  const parent = inferParentCollection(productCategory, productName);
  
  if (!parent) return null;

  // Find 1-2 cross-links from the parent's cluster
  const parentMc = MONEY_COLLECTIONS.find(mc => mc.slug === parent.slug);
  const crossLinks = parentMc?.crossLinks
    ?.map(slug => MONEY_COLLECTIONS.find(mc => mc.slug === slug))
    .filter(Boolean)
    .slice(0, 2) || [];

  return (
    <div className="mt-6 space-y-3">
      {/* Parent collection link */}
      <Link
        to={`/collections/${parent.slug}`}
        className="inline-flex items-center gap-2 text-sm text-primary hover:underline font-medium"
      >
        <ArrowRight className="w-3.5 h-3.5" />
        Browse all {parent.name}
      </Link>
      
      {/* Cross-collection contextual link */}
      {crossLinks.length > 0 && (
        <div className="text-sm text-muted-foreground">
          {crossLinks.map((mc, i) => (
            <span key={mc!.slug}>
              {i > 0 && ' · '}
              <Link
                to={`/collections/${mc!.slug}`}
                className="text-primary/80 hover:text-primary hover:underline"
              >
                {mc!.shortName}
              </Link>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
