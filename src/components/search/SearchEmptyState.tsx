import { Link } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SUGGESTED_CATEGORIES = [
  { label: 'Cat Litter Boxes', href: '/collections/cat-litter-boxes' },
  { label: 'Cat Trees', href: '/collections/cat-trees' },
  { label: 'Orthopedic Dog Beds', href: '/collections/orthopedic-dog-beds' },
  { label: 'Dog Training Tools', href: '/collections/dog-training-behavior-tools' },
  { label: 'All Products', href: '/products' },
] as const;

export interface SearchEmptyStateProps {
  query: string;
  onClear?: () => void;
}

/**
 * CI-15 — quiet, search-specific empty state. Echoes the query, offers
 * popular category chips, and a calm clear-search CTA. Used when an active
 * search returns zero matches.
 */
export function SearchEmptyState({ query, onClear }: SearchEmptyStateProps) {
  return (
    <div className="text-center py-12 md:py-16 max-w-xl mx-auto">
      <div className="w-12 h-12 mx-auto mb-5 rounded-full border border-border/60 flex items-center justify-center">
        <Search className="w-5 h-5 text-muted-foreground" strokeWidth={1.5} />
      </div>

      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground mb-3">
        No matches
      </p>

      <h2 className="text-2xl md:text-3xl font-display font-semibold tracking-tight text-foreground mb-3">
        Nothing for &ldquo;{query}&rdquo;
      </h2>

      <p className="text-sm md:text-base text-muted-foreground mb-8 leading-relaxed">
        Try a shorter or simpler term — or jump into one of our most-shopped
        categories below.
      </p>

      <div className="flex flex-wrap justify-center gap-2 mb-8">
        {SUGGESTED_CATEGORIES.map((c) => (
          <Link
            key={c.href}
            to={c.href}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/60 text-xs text-foreground hover:bg-muted/50 transition-colors"
          >
            {c.label}
            <ArrowRight className="w-3 h-3 text-muted-foreground" strokeWidth={1.75} />
          </Link>
        ))}
      </div>

      {onClear && (
        <Button variant="outline" size="sm" className="rounded-full" onClick={onClear}>
          Clear search
        </Button>
      )}
    </div>
  );
}

export default SearchEmptyState;