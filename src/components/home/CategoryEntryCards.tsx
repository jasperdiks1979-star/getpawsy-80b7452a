import { Link } from 'react-router-dom';

const ENTRIES = [
  { to: '/collections/cat-trees-and-condos', label: 'Cat Trees & Condos', emoji: '🌳' },
  { to: '/collections/cat-litter-boxes', label: 'Cat Litter Boxes', emoji: '🐱' },
  { to: '/collections/dog-beds', label: 'Dog Beds', emoji: '🛏️' },
  { to: '/collections/dogs', label: 'Shop Dogs', emoji: '🐶' },
  { to: '/collections/cats', label: 'Shop Cats', emoji: '🐈' },
] as const;

export function CategoryEntryCards() {
  return (
    <section className="py-6 md:py-8" aria-label="Shop by category">
      <div className="container px-4 md:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          {ENTRIES.map((e) => (
            <Link
              key={e.to}
              to={e.to}
              className="flex items-center gap-3 p-4 md:p-5 rounded-2xl border border-border/50 bg-card hover:border-primary/40 hover:shadow-md transition-all group"
            >
              <span className="text-2xl">{e.emoji}</span>
              <span className="font-semibold text-sm md:text-base text-foreground group-hover:text-primary transition-colors">
                {e.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
