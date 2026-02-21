import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

interface SubCollection {
  slug: string;
  name: string;
  primary_keyword?: string;
  meta_description?: string | null;
}

interface CategoryClusterLinksProps {
  categoryName: string;
  categorySlug: string;
  relatedSlugs: string[];
  subCollections: SubCollection[];
}

export function CategoryClusterLinks({ categoryName, categorySlug, relatedSlugs, subCollections }: CategoryClusterLinksProps) {
  // Build cluster links from sub-collections and related slugs
  const clusterLinks = subCollections.length > 0 
    ? subCollections.slice(0, 3)
    : relatedSlugs.slice(0, 3).map(slug => ({ 
        slug, 
        name: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      }));

  if (clusterLinks.length === 0) return null;

  const shortName = categoryName.replace(/^Best\s+/i, '').replace(/\s–.*$/, '');

  return (
    <section className="mb-12 max-w-4xl">
      <h2 className="text-xl font-semibold mb-3">
        More {shortName} Resources
      </h2>
      <p className="text-muted-foreground leading-relaxed">
        Looking for something more specific? We've curated expert guides and collections to help you find the perfect {shortName.toLowerCase()} for your pet. 
        Explore our {clusterLinks.map((link, i) => (
          <span key={link.slug}>
            {i > 0 && (i === clusterLinks.length - 1 ? ' and ' : ', ')}
            <Link 
              to={`/collections/${link.slug}`}
              className="text-primary hover:underline font-medium"
            >
              {link.name.replace(/\s–.*$/, '')}
            </Link>
          </span>
        ))} collections for specialized picks. 
        Each product is tested by our editorial team and reviewed by US pet owners before making our list.
      </p>
      
      {/* Additional contextual links */}
      <div className="flex flex-wrap gap-3 mt-4">
        <Link 
          to="/products"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          Browse All Products <ArrowRight className="w-3 h-3" />
        </Link>
        <Link 
          to="/blog"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          Read Our Blog <ArrowRight className="w-3 h-3" />
        </Link>
        <Link 
          to="/bestsellers"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          2026 Bestsellers <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </section>
  );
}
