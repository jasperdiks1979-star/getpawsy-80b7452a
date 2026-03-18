/**
 * SuperclusterRelatedContent — Universal related content blocks for guides, collections, and products.
 * 
 * Renders contextual internal link blocks based on the supercluster engine:
 * - "Related Guides" (guide→guide, collection→guide)
 * - "Shop This Topic" (guide→collection, product→collection)
 * - "Continue Reading" (guide→pillar + siblings)
 * - "Compare Related Options" (collection→collection)
 * 
 * All links are crawlable <a> tags present in raw HTML for Googlebot.
 */

import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, ShoppingBag, Compass, GitCompare } from 'lucide-react';
import {
  getGuideLinks,
  getCollectionLinks,
  getProductLinks,
  type SuperclusterLinkRecommendation,
} from '@/lib/supercluster-link-engine';

interface SuperclusterRelatedContentProps {
  /** Current page type */
  pageType: 'guide' | 'collection' | 'product';
  /** Current page slug (guide slug, collection slug, or product category) */
  currentSlug: string;
  /** Product name (only for product pages) */
  productName?: string;
  /** Optional: guide index for title resolution */
  guidesIndex?: Array<{ slug: string; title: string }>;
  className?: string;
}

function humanize(slug: string): string {
  return slug
    .replace(/^(best-|how-to-)/g, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\b(2026|2025)\b/, '($&)');
}

function LinkCard({ rec, title }: { rec: SuperclusterLinkRecommendation; title?: string }) {
  return (
    <Link
      to={rec.targetPath}
      className="group flex flex-col gap-1 rounded-xl border border-border/40 bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all"
    >
      <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
        {title || humanize(rec.targetPath.split('/').pop() || '')}
      </span>
      <span className="inline-flex items-center gap-1 text-xs text-primary mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {rec.targetType === 'collection' ? 'Shop this collection' : 'Read the full guide'}
        <ArrowRight className="w-3 h-3" />
      </span>
    </Link>
  );
}

export function SuperclusterRelatedContent({
  pageType,
  currentSlug,
  productName = '',
  guidesIndex = [],
  className = '',
}: SuperclusterRelatedContentProps) {
  const titleMap = new Map(guidesIndex.map(g => [g.slug, g.title.split('–')[0].split('|')[0].trim()]));

  let recs: SuperclusterLinkRecommendation[] = [];

  if (pageType === 'guide') {
    recs = getGuideLinks(currentSlug);
  } else if (pageType === 'collection') {
    recs = getCollectionLinks(currentSlug);
  } else if (pageType === 'product') {
    recs = getProductLinks(currentSlug, productName);
  }

  if (recs.length === 0) return null;

  // Group by type
  const pillarLinks = recs.filter(r => r.targetType === 'pillar');
  const guideLinks = recs.filter(r => r.targetType === 'guide');
  const collectionLinks = recs.filter(r => r.targetType === 'collection');

  const resolveTitle = (rec: SuperclusterLinkRecommendation): string => {
    const slug = rec.targetPath.split('/').pop() || '';
    return titleMap.get(slug) || humanize(slug);
  };

  return (
    <nav className={`py-8 space-y-8 ${className}`} aria-label="Related content">
      {/* Pillar / Continue Reading */}
      {pillarLinks.length > 0 && pageType !== 'product' && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Compass className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Continue Reading
            </h3>
          </div>
          <div className="space-y-2">
            {pillarLinks.map(rec => (
              <Link
                key={rec.targetPath}
                to={rec.targetPath}
                className="group flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl p-4 hover:bg-primary/10 transition-colors"
              >
                <BookOpen className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm font-semibold text-primary">
                  {resolveTitle(rec)}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-primary ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Related Guides */}
      {guideLinks.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {pageType === 'collection' ? 'Expert Guides' : 'Related Guides'}
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {guideLinks.slice(0, 6).map(rec => (
              <LinkCard key={rec.targetPath} rec={rec} title={resolveTitle(rec)} />
            ))}
          </div>
        </section>
      )}

      {/* Shop This Topic */}
      {collectionLinks.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <ShoppingBag className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {pageType === 'collection' ? 'Compare Related Options' : 'Shop This Topic'}
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {collectionLinks.map(rec => (
              <Link
                key={rec.targetPath}
                to={rec.targetPath}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full bg-muted hover:bg-primary/10 text-foreground hover:text-primary transition-colors"
              >
                {humanize(rec.targetPath.split('/').pop() || '')}
                <ArrowRight className="w-3 h-3" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Product page: Learn More block */}
      {pageType === 'product' && pillarLinks.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Learn More
            </h3>
          </div>
          {pillarLinks.map(rec => (
            <Link
              key={rec.targetPath}
              to={rec.targetPath}
              className="group flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-card hover:border-primary/30 transition-all"
            >
              <BookOpen className="w-5 h-5 text-primary flex-shrink-0" />
              <div>
                <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors block">
                  {resolveTitle(rec)}
                </span>
                <span className="text-xs text-muted-foreground">Complete buying guide with expert picks</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary ml-auto transition-colors" />
            </Link>
          ))}
        </section>
      )}
    </nav>
  );
}
