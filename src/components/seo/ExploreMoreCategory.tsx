import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight, Grid3X3, BookOpen, ShoppingBag } from 'lucide-react';
import { buildOptimizedImageUrl } from '@/lib/image-optimizer';

interface ExploreMoreCategoryProps {
  category: string | null;
  currentProductId: string;
  currentProductSlug: string | null;
}

// Map product categories to collection slugs
const categoryToCollection: Record<string, { slug: string; label: string }> = {
  'cat trees': { slug: 'cat-condos', label: 'Cat Trees & Condos' },
  'cat litter': { slug: 'best-cat-litter-boxes', label: 'Cat Litter Boxes' },
  'cat toys': { slug: 'best-cat-toys-for-indoor-cats', label: 'Cat Toys' },
  'cat beds': { slug: 'best-cat-beds', label: 'Cat Beds' },
  'cat carriers': { slug: 'best-cat-carriers', label: 'Cat Carriers' },
  'cat scratching': { slug: 'best-cat-scratching-posts', label: 'Cat Scratching Posts' },
  'cat feeders': { slug: 'automatic-cat-feeders', label: 'Cat Feeders' },
  'dog beds': { slug: 'orthopedic-calming-dog-beds', label: 'Dog Beds' },
  'dog toys': { slug: 'best-interactive-dog-toys', label: 'Dog Toys' },
  'dog harness': { slug: 'best-dog-harnesses', label: 'Dog Harnesses' },
  'dog car': { slug: 'best-dog-car-seats', label: 'Dog Car Seats' },
  'dog grooming': { slug: 'best-dog-grooming-kits', label: 'Dog Grooming' },
  'dog food': { slug: 'best-slow-feeder-dog-bowls', label: 'Dog Feeding' },
  'dog bowl': { slug: 'best-slow-feeder-dog-bowls', label: 'Dog Bowls' },
  'dog travel': { slug: 'dogs', label: 'Dog Products' },
  'pet training': { slug: 'dogs', label: 'Dog Products' },
  'pet accessories': { slug: 'dogs', label: 'All Dog Products' },
  'pet grooming': { slug: 'best-dog-grooming-kits', label: 'Grooming Supplies' },
};

// Map to guide slugs  
const categoryToGuide: Record<string, { slug: string; label: string }> = {
  'cat trees': { slug: 'best-cat-trees-small-apartments', label: 'Best Cat Trees Guide' },
  'cat litter': { slug: 'best-cat-litter-box-2026', label: 'Best Litter Box Guide' },
  'cat toys': { slug: 'best-cat-toys-for-indoor-cats', label: 'Indoor Cat Enrichment' },
  'dog beds': { slug: 'best-dog-beds-guide', label: 'Dog Bed Buying Guide' },
  'dog toys': { slug: 'best-dog-toys-guide', label: 'Dog Toy Buying Guide' },
  'dog car': { slug: 'best-dog-car-seats', label: 'Dog Car Seat Guide' },
};

// Related collections for cross-linking depth (Phase 3)
const categoryToRelatedCollection: Record<string, { slug: string; label: string }> = {
  'cat trees': { slug: 'best-cat-beds', label: 'Cat Beds' },
  'cat litter': { slug: 'automatic-cat-feeders', label: 'Automatic Cat Feeders' },
  'cat beds': { slug: 'cat-condos', label: 'Cat Condos' },
  'dog beds': { slug: 'best-orthopedic-dog-beds', label: 'Orthopedic Dog Beds' },
  'dog toys': { slug: 'best-interactive-dog-toys', label: 'Interactive Dog Toys' },
  'dog car': { slug: 'dogs', label: 'Dog Products' },
  'dog harness': { slug: 'best-dog-car-seats', label: 'Dog Car Seats' },
  'dog grooming': { slug: 'dogs', label: 'All Dog Products' },
};

function findCollectionMatch(category: string | null): { slug: string; label: string } | null {
  if (!category) return null;
  const catLower = category.toLowerCase();
  for (const [key, value] of Object.entries(categoryToCollection)) {
    if (catLower.includes(key)) return value;
  }
  // Fallback: detect pet type
  if (catLower.includes('cat') || catLower.includes('kitten')) return { slug: 'cats', label: 'All Cat Products' };
  if (catLower.includes('dog') || catLower.includes('puppy')) return { slug: 'dogs', label: 'All Dog Products' };
  return null;
}

function findGuideMatch(category: string | null): { slug: string; label: string } | null {
  if (!category) return null;
  const catLower = category.toLowerCase();
  for (const [key, value] of Object.entries(categoryToGuide)) {
    if (catLower.includes(key)) return value;
  }
  return null;
}

function findRelatedCollection(category: string | null): { slug: string; label: string } | null {
  if (!category) return null;
  const catLower = category.toLowerCase();
  for (const [key, value] of Object.entries(categoryToRelatedCollection)) {
    if (catLower.includes(key)) return value;
  }
  return null;
}

export function ExploreMoreCategory({ category, currentProductId }: ExploreMoreCategoryProps) {
  const collectionMatch = findCollectionMatch(category);
  const guideMatch = findGuideMatch(category);
  const relatedCollectionMatch = findRelatedCollection(category);

  // Fetch 2 related products from same category
  const { data: relatedProducts = [] } = useQuery({
    queryKey: ['explore-more-products', category, currentProductId],
    queryFn: async () => {
      if (!category) return [];
      const { data, error } = await supabase
        .from('products_public')
        .select('id, name, slug, image_url, price')
        .eq('is_active', true)
        .ilike('category', `%${category}%`)
        .neq('id', currentProductId)
        .limit(2);
      if (error) return [];
      return data || [];
    },
    enabled: !!category,
    staleTime: 5 * 60 * 1000,
  });

  if (!collectionMatch && relatedProducts.length === 0) return null;

  const shortCategory = category?.replace(/^Pet\s+/i, '') || 'Products';

  return (
    <section className="mt-16 bg-muted/30 rounded-2xl p-6 md:p-8">
      <div className="flex items-center gap-2 mb-6">
        <Grid3X3 className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold">
          Explore More in {shortCategory}
        </h2>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Category page link */}
        {collectionMatch && (
          <Link
            to={`/collections/${collectionMatch.slug}`}
            className="group flex flex-col items-center justify-center bg-card border rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all text-center"
          >
            <ShoppingBag className="w-6 h-6 text-primary mb-2" />
            <span className="font-medium text-sm group-hover:text-primary transition-colors">
              {collectionMatch.label}
            </span>
            <span className="inline-flex items-center gap-1 text-primary text-xs mt-1">
              Shop {collectionMatch.label} <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        )}

        {/* Related products */}
        {relatedProducts.map(product => (
          <Link
            key={product.id}
            to={`/product/${product.slug || product.id}`}
            className="group flex gap-3 bg-card border rounded-xl p-4 hover:border-primary/30 hover:shadow-md transition-all"
          >
            {product.image_url && (
              <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                <img src={buildOptimizedImageUrl(product.image_url, { w: 128, q: 'auto' })} alt={product.name} width={64} height={64} className="w-full h-full object-cover" loading="lazy" decoding="async" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-medium text-sm group-hover:text-primary transition-colors line-clamp-2">
                {product.name}
              </h3>
              <span className="text-sm font-bold text-primary">${Number(product.price).toFixed(2)}</span>
            </div>
          </Link>
        ))}

        {/* Buying guide link */}
        {guideMatch && (
          <Link
            to={`/guides/${guideMatch.slug}`}
            className="group flex flex-col items-center justify-center bg-card border rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all text-center"
          >
            <BookOpen className="w-6 h-6 text-primary mb-2" />
            <span className="font-medium text-sm group-hover:text-primary transition-colors">
              {guideMatch.label}
            </span>
            <span className="inline-flex items-center gap-1 text-primary text-xs mt-1">
              Read our {guideMatch.label} guide <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        )}

        {/* Related collection link (Phase 3 depth) */}
        {relatedCollectionMatch && relatedCollectionMatch.slug !== collectionMatch?.slug && (
          <Link
            to={`/collections/${relatedCollectionMatch.slug}`}
            className="group flex flex-col items-center justify-center bg-card border rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all text-center"
          >
            <ShoppingBag className="w-6 h-6 text-muted-foreground mb-2" />
            <span className="font-medium text-sm group-hover:text-primary transition-colors">
              {relatedCollectionMatch.label}
            </span>
            <span className="inline-flex items-center gap-1 text-primary text-xs mt-1">
              Browse Related <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}
