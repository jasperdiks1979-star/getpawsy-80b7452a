import { Star, ExternalLink, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface AffiliateProduct {
  name: string;
  image: string;
  priceRange: string;
  rating: number;
  reviewCount?: number;
  pros: string[];
  cons: string[];
  affiliateUrl: string;
  bestFor?: string;
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
            {product.rating} {product.reviewCount ? `(${product.reviewCount.toLocaleString()})` : ''}
          </span>
        </div>

        {/* Price */}
        <p className="text-lg font-bold mb-2">{product.priceRange}</p>

        {product.bestFor && (
          <p className="text-xs text-muted-foreground mb-3">
            <span className="font-medium">Best for:</span> {product.bestFor}
          </p>
        )}

        {/* Pros/Cons */}
        <div className="space-y-1.5 mb-4">
          {product.pros.slice(0, 3).map(pro => (
            <div key={pro} className="flex items-start gap-1.5 text-xs">
              <ThumbsUp className="w-3 h-3 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{pro}</span>
            </div>
          ))}
          {product.cons.slice(0, 1).map(con => (
            <div key={con} className="flex items-start gap-1.5 text-xs">
              <ThumbsDown className="w-3 h-3 text-destructive shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{con}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <Button className="w-full gap-2 text-sm" asChild>
          <a
            href={product.affiliateUrl}
            target="_blank"
            rel="nofollow sponsored noopener"
          >
            View Details <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </Button>
      </div>
    </div>
  );
}

/** Grid wrapper for affiliate products */
export function AffiliateProductGrid({ products }: { products: AffiliateProduct[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Badge variant="secondary" className="text-xs">Expert Curated Picks</Badge>
        <span className="text-xs text-muted-foreground">
          Independently selected · We may earn a commission
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((product, i) => (
          <AffiliateProductCard key={product.name} product={product} position={i + 1} />
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        <a href="/affiliate-disclosure" className="underline">Affiliate Disclosure</a>: GetPawsy is reader-supported. When you buy through links on our site, we may earn a small commission at no extra cost to you.
      </p>
    </div>
  );
}
