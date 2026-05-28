import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface AffiliateProduct {
  name: string;
  image: string;
  priceRange: string;
  rating: number;
  slug?: string;
  badge?: string;
}

interface AffiliateProductCardProps {
  product: AffiliateProduct;
  position?: number;
}

export function AffiliateProductCard({ product, position }: AffiliateProductCardProps) {
  return (
    <div className="bg-card border rounded-2xl overflow-hidden hover:shadow-lg transition-shadow">
      {/* Image */}
      <div className="relative aspect-square bg-muted/30 overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-contain p-4"
          loading="lazy"
        />
        {product.badge && (
          <Badge className="absolute top-3 left-3 text-[10px]">{product.badge}</Badge>
        )}
        {position && (
          <span className="absolute top-3 right-3 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
            #{position}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-sm mb-1 line-clamp-2">{product.name}</h3>
        
        {/* Rating */}
        <div className="flex items-center gap-1.5 mb-2">
          <div className="flex gap-0.5">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={`w-3.5 h-3.5 ${i < Math.floor(product.rating) ? 'fill-primary text-primary' : 'text-muted-foreground/30'}`}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            {product.rating}
          </span>
        </div>

        {/* Price */}
        <p className="text-lg font-bold mb-3">{product.priceRange}</p>

        {/* CTA */}
        <Button className="w-full gap-2 text-sm" asChild>
          <Link to={product.slug ? `/products/${product.slug}` : '/products'}>
            View Details
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** Grid wrapper for products */
export function AffiliateProductGrid({ products }: { products: AffiliateProduct[] }) {
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((product, i) => (
          <AffiliateProductCard key={product.name} product={product} position={i + 1} />
        ))}
      </div>
    </div>
  );
}
