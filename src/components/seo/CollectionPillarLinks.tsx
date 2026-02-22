/**
 * CollectionPillarLinks
 * 
 * Renders internal links from a sub-collection back to its parent pillar
 * and to sibling collections within the same cluster.
 * Ensures every collection page has 2+ internal link sources.
 */

import { Link } from 'react-router-dom';
import { getPillarForCollection, getSiblingCollections, isPillarPage } from '@/lib/topic-cluster-pillars';

interface CollectionPillarLinksProps {
  collectionSlug: string;
  className?: string;
}

export function CollectionPillarLinks({ collectionSlug, className = '' }: CollectionPillarLinksProps) {
  const pillar = getPillarForCollection(collectionSlug);
  if (!pillar) return null;

  const isThisPillar = isPillarPage(collectionSlug);
  const siblings = getSiblingCollections(collectionSlug).slice(0, 4);

  // Pillar pages show children, child pages show pillar + siblings
  const humanize = (slug: string) =>
    slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <nav className={`py-6 ${className}`} aria-label="Related collections">
      {!isThisPillar && (
        <div className="mb-4">
          <span className="text-sm text-muted-foreground">Part of: </span>
          <Link
            to={`/collections/${pillar.pillarSlug}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            {pillar.name}
          </Link>
        </div>
      )}

      {siblings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            {isThisPillar ? 'Explore Sub-Categories' : 'Related Collections'}
          </h3>
          <div className="flex flex-wrap gap-2">
            {siblings.map(slug => (
              <Link
                key={slug}
                to={`/collections/${slug}`}
                className="inline-block px-3 py-1.5 text-xs font-medium rounded-full bg-muted hover:bg-muted/80 text-foreground transition-colors"
              >
                {humanize(slug)}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
