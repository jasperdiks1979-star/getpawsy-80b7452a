import { Link } from 'react-router-dom';
import { ArrowRight, Bookmark } from 'lucide-react';

interface BlogCategoryLinksProps {
  blogCategory: string;
}

const categoryLinkMap: Record<string, Array<{ href: string; label: string; type: 'collection' | 'guide' }>> = {
  Dogs: [
    { href: '/collections/dogs', label: 'Browse Dog Essentials', type: 'collection' },
    { href: '/collections/dog-beds', label: 'Orthopedic & Calming Dog Beds', type: 'collection' },
    { href: '/collections/dog-travel-accessories', label: 'Dog Travel Accessories', type: 'collection' },
    { href: '/guides/best-dog-bed-2026', label: 'How to Choose the Right Dog Bed', type: 'guide' },
  ],
  Cats: [
    { href: '/collections/cats', label: 'Explore Cat Products', type: 'collection' },
    { href: '/collections/cat-trees-and-condos', label: 'Cat Trees & Condos', type: 'collection' },
    { href: '/collections/cat-litter-boxes', label: 'Top-Rated Litter Boxes', type: 'collection' },
    { href: '/guides/best-cat-litter-box-2026', label: 'Complete Litter Box Guide 2026', type: 'guide' },
  ],
  Health: [
    { href: '/collections/dog-beds', label: 'Orthopedic Beds for Joint Support', type: 'collection' },
    { href: '/collections/cats', label: 'GetPawsy Cat Health Collection', type: 'collection' },
    { href: '/guides/best-cat-litter-box-2026', label: 'Litter Box Hygiene & Health Guide', type: 'guide' },
  ],
  General: [
    { href: '/collections/dogs', label: 'GetPawsy Dog Collection', type: 'collection' },
    { href: '/collections/cats', label: 'GetPawsy Cat Collection', type: 'collection' },
    { href: '/bestsellers', label: 'See Our 2026 Bestsellers', type: 'collection' },
    { href: '/guides', label: 'Expert Pet Guides', type: 'guide' },
  ],
  Guides: [
    { href: '/collections/dog-beds', label: 'Recommended Orthopedic Dog Beds', type: 'collection' },
    { href: '/collections/cat-trees-and-condos', label: 'Browse Cat Trees & Condos', type: 'collection' },
    { href: '/guides/best-cat-trees-small-apartments', label: 'Cat Trees for Small Spaces Guide', type: 'guide' },
    { href: '/guides/dog-grooming-essentials-guide', label: 'Dog Grooming Guide', type: 'guide' },
  ],
  Fish: [
    { href: '/collections/dogs', label: 'Explore Our Dog Collection', type: 'collection' },
    { href: '/collections/cats', label: 'Explore Our Cat Collection', type: 'collection' },
  ],
  'Dog Care': [
    { href: '/collections/dogs', label: 'Browse All Dog Products', type: 'collection' },
    { href: '/collections/dog-beds', label: 'Dog Bed Collection', type: 'collection' },
    { href: '/guides/best-dog-bed-2026', label: 'Dog Bed Buying Guide', type: 'guide' },
  ],
  'Cat Care': [
    { href: '/collections/cats', label: 'Browse All Cat Products', type: 'collection' },
    { href: '/collections/cat-trees-and-condos', label: 'Cat Trees & Condos', type: 'collection' },
    { href: '/guides/best-cat-litter-box-2026', label: 'Litter Box Selection Guide', type: 'guide' },
  ],
  'cat-care': [
    { href: '/collections/cats', label: 'GetPawsy Cat Products', type: 'collection' },
    { href: '/collections/cat-litter-boxes', label: 'Cat Litter Boxes', type: 'collection' },
    { href: '/collections/cat-trees-and-condos', label: 'Cat Trees & Scratching Posts', type: 'collection' },
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
