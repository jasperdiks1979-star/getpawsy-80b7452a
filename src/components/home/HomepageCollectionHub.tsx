/**
 * HomepageCollectionHub — Authority hub links from homepage to key collection pages.
 * Uses <a href> for raw HTML crawlability. Shows only collections with real inventory (3+).
 */

import { ArrowRight } from 'lucide-react';

const HUB_COLLECTIONS = [
  { href: '/collections/cat-trees-and-condos', label: 'Cat Trees & Condos', icon: '🐈', desc: 'Multi-level climbing furniture for indoor cats' },
  { href: '/collections/cat-litter-boxes', label: 'Cat Litter Boxes', icon: '🧹', desc: 'Self-cleaning, enclosed & odor-control options' },
  { href: '/collections/dog-beds', label: 'Dog Beds', icon: '🛏️', desc: 'Orthopedic, calming & elevated dog beds' },
  { href: '/guides/dog-travel-essentials-guide', label: 'Dog Travel Guide', icon: '✈️', desc: 'Expert tips for traveling safely with dogs' },
  { href: '/guides', label: 'Expert Guides', icon: '📖', desc: 'In-depth buying advice from pet experts' },
  { href: '/bestsellers', label: 'Bestsellers', icon: '⭐', desc: 'Our most popular picks for dogs & cats' },
] as const;

export function HomepageCollectionHub() {
  return (
    <section className="py-8 md:py-12 border-t border-border/30" aria-label="Shop by Collection">
      <div className="container px-4 md:px-6">
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-6">
          Shop by Collection
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {HUB_COLLECTIONS.map((col) => (
            <a
              key={col.href}
              href={col.href}
              className="group block rounded-xl border border-border/40 bg-card p-4 text-center hover:border-primary/30 hover:shadow-sm transition-all"
            >
              <span className="text-2xl block mb-2">{col.icon}</span>
              <h3 className="font-semibold text-xs md:text-sm text-foreground group-hover:text-primary transition-colors mb-1 line-clamp-1">
                {col.label}
              </h3>
              <p className="text-[10px] md:text-xs text-muted-foreground line-clamp-2 hidden sm:block">{col.desc}</p>
            </a>
          ))}
        </div>
        <div className="mt-4 flex justify-center">
          <a
            href="/products"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            View all products <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
