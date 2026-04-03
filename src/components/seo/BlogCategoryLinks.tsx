import { Link } from 'react-router-dom';
import { ArrowRight, Bookmark } from 'lucide-react';

interface BlogCategoryLinksProps {
  blogCategory: string;
}

// Map blog categories to relevant collection + guide links
// Anchor text diversified: mix of partial-match, branded, and natural anchors
const categoryLinkMap: Record<string, Array<{ href: string; label: string; type: 'collection' | 'guide' }>> = {
  Dogs: [
    { href: '/collections/dogs', label: 'Browse Dog Essentials', type: 'collection' },
    { href: '/collections/best-interactive-dog-toys', label: 'Top Interactive Dog Toys', type: 'collection' },
    { href: '/collections/dog-beds', label: 'Orthopedic & Calming Dog Beds', type: 'collection' },
    { href: '/collections/dogs', label: 'Best Dog Harnesses & Leashes', type: 'collection' },
    { href: '/guides/best-dog-beds-guide', label: 'How to Choose the Right Dog Bed', type: 'guide' },
  ],
  Cats: [
    { href: '/collections/cats', label: 'Explore Cat Products', type: 'collection' },
    { href: '/collections/cat-condos', label: 'Cat Condos & Hideaways', type: 'collection' },
    { href: '/collections/cat-litter-boxes', label: 'Top-Rated Litter Boxes', type: 'collection' },
    { href: '/collections/best-cat-toys-for-indoor-cats', label: 'Indoor Cat Toy Picks', type: 'collection' },
    { href: '/guides/best-cat-litter-box-2026', label: 'Complete Litter Box Guide 2026', type: 'guide' },
  ],
  Health: [
    { href: '/collections/dog-beds', label: 'Orthopedic Beds for Joint Support', type: 'collection' },
    { href: '/collections/best-slow-feeder-dog-bowls', label: 'Slow Feeder Bowls for Healthier Eating', type: 'collection' },
    { href: '/collections/cats', label: 'GetPawsy Cat Health Collection', type: 'collection' },
    { href: '/guides/best-cat-litter-box-2026', label: 'Litter Box Hygiene & Health Guide', type: 'guide' },
  ],
  General: [
    { href: '/collections/dogs', label: 'GetPawsy Dog Collection', type: 'collection' },
    { href: '/collections/cats', label: 'GetPawsy Cat Collection', type: 'collection' },
    { href: '/bestsellers', label: 'See Our 2026 Bestsellers', type: 'collection' },
    { href: '/collections/dog-enrichment-toys', label: 'Enrichment Toys & Training Aids', type: 'collection' },
  ],
  Guides: [
    { href: '/collections/dog-beds', label: 'Recommended Orthopedic Dog Beds', type: 'collection' },
    { href: '/collections/cat-condos', label: 'Browse Cat Condos', type: 'collection' },
    { href: '/guides/best-cat-trees-small-apartments', label: 'Cat Trees for Small Spaces Guide', type: 'guide' },
    { href: '/collections/best-dog-grooming-kits', label: 'Grooming Kits Reviewed by Our Team', type: 'collection' },
  ],
  // Non-core verticals: keep links but fewer, pointing to core collections
  Fish: [
    { href: '/collections/dogs', label: 'Explore Our Dog Collection', type: 'collection' },
    { href: '/collections/cats', label: 'Explore Our Cat Collection', type: 'collection' },
  ],
  'Dog Care': [
    { href: '/collections/dogs', label: 'Browse All Dog Products', type: 'collection' },
    { href: '/collections/best-dog-grooming-kits', label: 'Dog Grooming Essentials', type: 'collection' },
    { href: '/guides/best-dog-beds-guide', label: 'Dog Bed Buying Guide', type: 'guide' },
  ],
  'Cat Care': [
    { href: '/collections/cats', label: 'Browse All Cat Products', type: 'collection' },
    { href: '/collections/cat-condos', label: 'Cat Condo Collection', type: 'collection' },
    { href: '/guides/best-cat-litter-box-2026', label: 'Litter Box Selection Guide', type: 'guide' },
  ],
  'cat-care': [
    { href: '/collections/cats', label: 'GetPawsy Cat Products', type: 'collection' },
    { href: '/collections/best-cat-beds', label: 'Cozy Cat Bed Picks', type: 'collection' },
    { href: '/collections/best-cat-scratching-posts', label: 'Scratching Post Recommendations', type: 'collection' },
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
