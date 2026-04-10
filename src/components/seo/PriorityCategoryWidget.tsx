/**
 * PriorityCategoryWidget — "Top Rated" internal cluster widget
 * 
 * Renders a compact cross-link block for the 3 priority categories.
 * Used on homepage, blog posts, and related pages to concentrate
 * authority flow toward revenue pillars.
 */
import { Link } from 'react-router-dom';
import { Star, ArrowRight } from 'lucide-react';

const PRIORITY_LINKS = [
  {
    href: '/collections/all',
    title: 'Orthopedic Dog Beds',
    desc: 'Premium memory foam beds for joint support & large breeds',
    badge: '⭐ Top Rated',
  },
  {
    href: '/collections/all',
    title: 'Cat Trees for Large Cats',
    desc: 'Heavy-duty, anti-tip tested for 25+ lb cats & Maine Coons',
    badge: '⭐ Top Rated',
  },
  {
    href: '/collections/all',
    title: 'Dog Car Travel Safety',
    desc: 'Crash-tested car seats, harnesses & booster seats',
    badge: '⭐ Top Rated',
  },
];

export function PriorityCategoryWidget({ exclude }: { exclude?: string }) {
  const links = PRIORITY_LINKS.filter(l => !l.href.includes(exclude || '__none__'));
  
  return (
    <section className="bg-muted/30 rounded-2xl p-6 md:p-8">
      <div className="flex items-center gap-2 mb-4">
        <Star className="w-5 h-5 text-primary fill-primary" />
        <h3 className="font-display font-semibold text-lg">Top Rated Categories</h3>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {links.map(link => (
          <Link
            key={link.href}
            to={link.href}
            className="group bg-background border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all"
          >
            <span className="text-xs font-medium text-primary mb-1 block">{link.badge}</span>
            <h4 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">{link.title}</h4>
            <p className="text-xs text-muted-foreground mb-2">{link.desc}</p>
            <span className="text-xs text-primary font-medium inline-flex items-center gap-1">
              Shop Now <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
