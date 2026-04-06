import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';

const MONEY_PAGES = [
  { href: '/guides/best-cat-litter-box-2026', label: 'Best Litter Boxes' },
  { href: '/collections/cat-trees-and-condos', label: 'Cat Trees & Condos' },
  { href: '/collections/cat-litter-boxes', label: 'Shop Litter Boxes' },
  { href: '/collections/dog-beds', label: 'Dog Beds' },
  { href: '/collections/dogs', label: 'All Dog Products' },
  { href: '/collections/cats', label: 'All Cat Products' },
  { href: '/products', label: 'All Products' },
];

interface GuideMoneyLinksProps {
  currentSlug: string;
  position: 'top' | 'bottom';
  relatedCategories?: string[];
}

export function GuideMoneyLinks({ currentSlug, position, relatedCategories = [] }: GuideMoneyLinksProps) {
  // Filter out self-links and pick relevant ones
  const links = MONEY_PAGES.filter(l => !l.href.includes(currentSlug));

  // For top: show 3 most relevant compact links
  if (position === 'top') {
    const topLinks = links.slice(0, 4);
    return (
      <nav className="flex flex-wrap items-center gap-2 mb-6 text-xs" aria-label="Related shopping categories">
        <ShoppingBag className="w-3.5 h-3.5 text-primary" />
        <span className="text-muted-foreground font-medium">Shop:</span>
        {topLinks.map(l => (
          <Link
            key={l.href}
            to={l.href}
            className="text-primary hover:underline font-medium"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    );
  }

  // Bottom: fuller CTA block
  return (
    <div className="rounded-2xl border border-border bg-card p-5 mb-10">
      <h3 className="text-sm font-display font-bold text-foreground mb-3 flex items-center gap-2">
        <ShoppingBag className="w-4 h-4 text-primary" />
        Recommended Collections
      </h3>
      <div className="flex flex-wrap gap-2">
        {links.slice(0, 6).map(l => (
          <Link
            key={l.href}
            to={l.href}
            className="text-sm bg-muted/50 border border-border rounded-full px-4 py-1.5 hover:border-primary/40 hover:text-primary transition-all font-medium"
          >
            {l.label} →
          </Link>
        ))}
      </div>
    </div>
  );
}
