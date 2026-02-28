/**
 * RelatedGuidesBlock — contextual guide links for product, collection, and blog pages.
 * 
 * Renders 2–6 related guide links as crawlable <a> anchors.
 * Used to strengthen silo internal linking from commerce pages to informational content.
 */

import { Link } from 'react-router-dom';

export interface GuideLink {
  href: string;
  title: string;
  description?: string;
}

interface RelatedGuidesBlockProps {
  guides: GuideLink[];
  title?: string;
  className?: string;
}

export function RelatedGuidesBlock({
  guides,
  title = 'Training Tips & Guides',
  className = '',
}: RelatedGuidesBlockProps) {
  if (!guides || guides.length === 0) return null;

  return (
    <section className={`py-8 ${className}`}>
      <h2 className="text-xl font-display font-bold mb-4">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {guides.map(guide => (
          <Link
            key={guide.href}
            to={guide.href}
            className="group flex flex-col gap-1 rounded-xl border border-border/40 bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all"
          >
            <span className="font-semibold text-foreground group-hover:text-primary transition-colors text-sm">
              {guide.title} →
            </span>
            {guide.description && (
              <span className="text-xs text-muted-foreground">{guide.description}</span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
