import { Link } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { getTopSprintProducts } from '@/lib/sprint-products';

/**
 * Sitewide "Trending Now" strip — renders below the navbar.
 * Shows top 4 sprint products as quick-access links.
 * Static data, no DB calls, no layout shift.
 */

const trending = getTopSprintProducts(4);

export const TrendingNowStrip = () => {
  return (
    <div className="w-full bg-accent/50 border-b border-border/50 overflow-hidden">
      <div className="container px-4 py-2 flex items-center gap-3 overflow-x-auto scrollbar-hide">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-primary whitespace-nowrap shrink-0">
          <TrendingUp className="w-3.5 h-3.5" />
          Trending Now
        </span>
        <span className="w-px h-4 bg-border shrink-0" aria-hidden="true" />
        {trending.map((p) => (
          <Link
            key={p.slug}
            to={`/product/${p.slug}`}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap shrink-0"
          >
            {p.name}
          </Link>
        ))}
      </div>
    </div>
  );
};
