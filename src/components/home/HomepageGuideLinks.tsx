/**
 * HomepageGuideLinks — Crawlable guide links on homepage for SEO authority flow.
 * Uses <a href> tags for raw HTML crawlability.
 */

import { BookOpen, ArrowRight } from 'lucide-react';

const HOMEPAGE_GUIDES = [
  { href: '/guides/best-cat-litter-box-2026', label: 'Cat Litter Box Guide', desc: 'Compare self-cleaning, enclosed & furniture-style options' },
  { href: '/guides/best-cat-trees-small-apartments', label: 'Best Cat Trees for Large Cats', desc: 'Space-saving picks tested for stability' },
  { href: '/guides/best-dog-car-seats-safe-travel', label: 'Dog Car Seat Safety Guide', desc: 'Crash-tested picks for safe travel' },
  { href: '/guides/complete-dog-training-guide-2026', label: 'Dog Training Guide', desc: 'Stop pulling, barking & bad habits' },
  { href: '/guides/best-interactive-cat-toys-that-work', label: 'Best Cat Toys for Indoor Cats', desc: 'Expert picks for solo play & stimulation' },
  { href: '/guides/dog-grooming-essentials-guide', label: 'Dog Grooming at Home', desc: 'Brushes, nail trimmers & techniques' },
] as const;

export function HomepageGuideLinks() {
  return (
    <section className="py-10 md:py-14" aria-label="Expert Pet Guides">
      <div className="container px-4 md:px-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
              Expert Pet Guides
            </h2>
            <p className="text-sm text-muted-foreground">Buying guides updated for 2026</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {HOMEPAGE_GUIDES.map((guide) => (
            <a
              key={guide.href}
              href={guide.href}
              className="group block rounded-xl border border-border/40 bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all"
            >
              <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors mb-1">
                {guide.label}
              </h3>
              <p className="text-xs text-muted-foreground mb-2">{guide.desc}</p>
              <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
                Read Guide <ArrowRight className="w-3 h-3" />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
