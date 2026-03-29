import { Link } from 'react-router-dom';
import { ShoppingBag, ArrowRight, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getCanonicalCardPrice } from '@/lib/canonical-pricing';

interface Product {
  id: string;
  name: string;
  price: number;
  compare_at_price: number | null;
  image_url: string | null;
  slug: string | null;
  stock: number | null;
  variants?: unknown;
}

interface CategoryPopularProductsProps {
  categoryName: string;
  products: Product[];
}

// Anchor variations for product links
const productAnchors = [
  (name: string) => name,
  (name: string) => `Shop ${name}`,
  (name: string) => `${name} – Top Pick`,
];

export function CategoryPopularProducts({ categoryName, products }: CategoryPopularProductsProps) {
  // Take top 3 in-stock products as "popular"
  const popular = products
    .filter(p => (p.stock ?? 0) > 0)
    .slice(0, 3);

  if (popular.length === 0) return null;

  const shortName = categoryName.replace(/^Best\s+/i, '').replace(/\s–.*$/, '');

  return (
    <section className="mb-12">
      <div className="flex items-center gap-2 mb-6">
        <Star className="w-5 h-5 text-primary" />
        <h2 className="text-2xl font-semibold">
          Popular in {shortName}
        </h2>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {popular.map((product, i) => (
          <Link
            key={product.id}
            to={`/product/${product.slug || product.id}`}
            className="group block bg-card border rounded-xl overflow-hidden hover:border-primary/30 hover:shadow-md transition-all"
          >
            <div className="aspect-square bg-muted relative overflow-hidden">
              {product.image_url ? (
                <img 
                  src={product.image_url} 
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ShoppingBag className="w-8 h-8 text-muted-foreground/50" />
                </div>
              )}
              {(() => {
                const cp = getCanonicalCardPrice(product);
                return (
                  <>
                    {cp.compareAtPrice && (
                      <Badge className="absolute top-2 right-2 bg-destructive text-white text-xs">
                        -{Math.round((1 - cp.price / cp.compareAtPrice) * 100)}%
                      </Badge>
                    )}
                  </>
                );
              })()}
              {i === 0 && (
                <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs">
                  Best Seller
                </Badge>
              )}
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-sm mb-2 group-hover:text-primary transition-colors line-clamp-2">
                {productAnchors[i % productAnchors.length](product.name)}
              </h3>
              {(() => {
                const cp = getCanonicalCardPrice(product);
                return (
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-primary">{cp.displayPrice}</span>
                    {cp.displayCompareAt && (
                      <span className="text-xs text-muted-foreground line-through">
                        {cp.displayCompareAt}
                      </span>
                    )}
                  </div>
                );
              })()}
              <span className="inline-flex items-center gap-1 text-primary text-xs mt-2">
                See details & pricing <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
