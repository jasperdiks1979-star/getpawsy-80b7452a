import { Link } from 'react-router-dom';

interface CategorySeoEntry {
  heading: string;
  content: string;
  links: Array<{ to: string; text: string }>;
}

const CATEGORY_SEO_CONTENT: Record<string, CategorySeoEntry> = {
  'cat-trees-and-condos': {
    heading: 'Cat Trees & Cat Condos for Sale',
    content:
      'Finding the right cat tree or condo depends on your cat\'s size, personality, and your living space. Active climbers thrive on tall, multi-level cat trees with sisal scratching posts — protecting your furniture while satisfying natural climbing instincts. Senior or anxious cats may prefer enclosed cat condos that offer security and warmth. For multi-cat homes, choose trees with multiple platforms and condos at different heights so every cat gets their own territory.\n\nOur collection features cat trees tested for stability on hardwood, tile, and carpet — from budget towers under $100 to premium 6-foot structures for large breeds like Maine Coons and Ragdolls. Every tree uses natural sisal rope (never carpet wrapping) to build healthy scratching habits. Free US shipping on orders over $35.',
    links: [
      { to: '/guides/best-cat-trees-2026', text: 'Best Cat Trees (2026) — Complete Buyer\'s Guide' },
      { to: '/guides/best-cat-trees-small-apartments', text: 'Best Cat Trees for Small Apartments' },
      { to: '/guides/cat-condo-vs-cat-tower', text: 'Cat Condo vs Cat Tower — Which Is Better?' },
    ],
  },
};

interface CategorySeoContentProps {
  categorySlug: string;
}

export function CategorySeoContent({ categorySlug }: CategorySeoContentProps) {
  const entry = CATEGORY_SEO_CONTENT[categorySlug];
  if (!entry) return null;

  return (
    <div className="mb-8 max-w-3xl space-y-4">
      <div className="text-muted-foreground leading-relaxed text-sm whitespace-pre-line">
        {entry.content}
      </div>
      <div className="flex flex-wrap gap-3">
        {entry.links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="text-sm font-medium text-primary hover:underline"
          >
            📖 {link.text}
          </Link>
        ))}
      </div>
    </div>
  );
}
