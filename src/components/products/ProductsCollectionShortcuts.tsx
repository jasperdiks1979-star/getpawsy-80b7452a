/**
 * ProductsCollectionShortcuts — Quick-nav collection links for /products page.
 * Only links to collections with real inventory + guides hub.
 */

import { Link } from 'react-router-dom';

const SHORTCUTS = [
  { href: '/collections/cat-trees-and-condos', label: 'Cat Trees' },
  { href: '/collections/cat-litter-boxes', label: 'Litter Boxes' },
  { href: '/collections/dog-beds', label: 'Dog Beds' },
  { href: '/collections/dog-travel-accessories', label: 'Dog Travel' },
  { href: '/collections/dogs', label: 'All Dog Products' },
  { href: '/collections/cats', label: 'All Cat Products' },
  { href: '/bestsellers', label: 'Bestsellers' },
  { href: '/guides', label: 'Expert Guides' },
] as const;

export function ProductsCollectionShortcuts() {
  return (
    <nav className="mb-6" aria-label="Quick collection links">
      <div className="flex flex-wrap gap-2">
        {SHORTCUTS.map((s) => (
          <Link
            key={s.href}
            to={s.href}
            className="inline-flex items-center px-3 py-1.5 rounded-full bg-muted text-xs font-medium text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
          >
            {s.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
