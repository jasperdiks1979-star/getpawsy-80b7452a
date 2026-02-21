import { Link } from 'react-router-dom';
import { ArrowRight, Bookmark } from 'lucide-react';

interface BlogCategoryLinksProps {
  blogCategory: string;
}

// Map blog categories to relevant collection + guide links
const categoryLinkMap: Record<string, Array<{ href: string; label: string; type: 'collection' | 'guide' }>> = {
  Dogs: [
    { href: '/collections/dogs', label: 'Shop All Dog Products', type: 'collection' },
    { href: '/collections/best-interactive-dog-toys', label: 'Interactive Dog Toys', type: 'collection' },
    { href: '/collections/orthopedic-calming-dog-beds', label: 'Orthopedic Dog Beds', type: 'collection' },
    { href: '/guides/best-dog-beds-guide', label: 'Dog Bed Buying Guide', type: 'guide' },
  ],
  Cats: [
    { href: '/collections/cats', label: 'Shop All Cat Products', type: 'collection' },
    { href: '/collections/cat-condos', label: 'Cat Trees & Condos', type: 'collection' },
    { href: '/collections/best-cat-litter-boxes', label: 'Cat Litter Boxes', type: 'collection' },
    { href: '/guides/best-cat-litter-box-2026', label: 'Best Cat Litter Box 2026', type: 'guide' },
  ],
  Health: [
    { href: '/collections/dogs', label: 'Dog Health Products', type: 'collection' },
    { href: '/collections/cats', label: 'Cat Health Products', type: 'collection' },
    { href: '/guides/best-cat-litter-box-2026', label: 'Litter Box Health Guide', type: 'guide' },
  ],
  General: [
    { href: '/collections/dogs', label: 'Shop Dog Products', type: 'collection' },
    { href: '/collections/cats', label: 'Shop Cat Products', type: 'collection' },
    { href: '/bestsellers', label: 'Bestsellers 2026', type: 'collection' },
  ],
  Guides: [
    { href: '/collections/dogs', label: 'Dog Product Collections', type: 'collection' },
    { href: '/collections/cats', label: 'Cat Product Collections', type: 'collection' },
    { href: '/guides/best-cat-trees-small-apartments', label: 'Cat Tree Guide', type: 'guide' },
  ],
  Fish: [
    { href: '/products', label: 'Browse All Products', type: 'collection' },
  ],
};

export function BlogCategoryLinks({ blogCategory }: BlogCategoryLinksProps) {
  const links = categoryLinkMap[blogCategory] || categoryLinkMap.General;

  return (
    <div className="mt-12 pt-8 border-t">
      <div className="flex items-center gap-2 mb-4">
        <Bookmark className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Related Collections & Guides</h3>
      </div>
      <div className="flex flex-wrap gap-3">
        {links.map(link => (
          <Link
            key={link.href}
            to={link.href}
            className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-full border border-border hover:border-primary/40 hover:text-primary transition-colors bg-card"
          >
            {link.label}
            <ArrowRight className="w-3 h-3" />
          </Link>
        ))}
      </div>
    </div>
  );
}
