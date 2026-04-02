import { Link } from 'react-router-dom';
import { CheckCircle, TrendingUp, Truck, Shield, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ComparisonProduct } from '@/types/guide';

interface Props {
  products: ComparisonProduct[];
}

/** Trust triggers mapped by product badge or index */
const TRUST_TRIGGERS = [
  'Most popular choice',
  'Best value pick',
  'Recommended for large dogs',
  'Best for joint support',
];

/** Only render products with real image, price, name, and valid product link */
function isValidProduct(p: ComparisonProduct): boolean {
  if (!p.name || !p.price || !p.link) return false;
  if (!p.image || p.image.startsWith('/images/guides/')) return false;
  if (!p.link.startsWith('/product')) return false;
  return true;
}

export function ComparisonTable({ products }: Props) {
  if (!products || !Array.isArray(products)) return null;
  
  const valid = products.filter(isValidProduct);

  // Need at least 2 valid products to show comparison
  if (valid.length < 2) return null;

  return (
    <section className="mb-10">
      <h2 className="text-2xl font-display font-bold text-foreground mb-2">
        Product Comparison
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        Side-by-side comparison of our top-rated picks
      </p>
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(valid.length, 4)}, minmax(200px, 1fr))` }}>
          {valid.map((product, i) => (
            <div
              key={i}
              className={`relative bg-card rounded-xl border p-5 flex flex-col ${
                product.badge ? 'border-primary shadow-md ring-1 ring-primary/10' : 'border-border'
              }`}
            >
              {product.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                  {product.badge}
                </span>
              )}
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-32 object-contain mb-3 rounded-lg bg-muted/30"
                loading="lazy"
              />
              <h3 className="font-semibold text-foreground text-sm mb-1">{product.name}</h3>
              <p className="text-xl font-bold text-foreground mb-1">{product.price}</p>

              {/* Trust trigger */}
              <span className="flex items-center gap-1.5 text-xs font-semibold text-primary mb-3">
                <TrendingUp className="w-3 h-3" />
                {product.badge || TRUST_TRIGGERS[i] || 'Top rated'}
              </span>

              {product.availability && (
                <span className={`text-xs font-medium mb-2 inline-block ${
                  product.availability === 'InStock' ? 'text-green-600' :
                  product.availability === 'PreOrder' ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {product.availability === 'InStock' ? '✓ In Stock' :
                   product.availability === 'PreOrder' ? '⏳ Pre-Order' : '✗ Out of Stock'}
                </span>
              )}

              <ul className="space-y-1.5 mb-4 flex-1">
                {product.advantages.map((adv, j) => (
                  <li key={j} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                    {adv}
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <Link to={product.link} className="block mt-auto">
                <Button className="w-full gap-1.5 font-semibold" size="sm">
                  Buy Now <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* Trust footer */}
      <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground bg-muted/40 rounded-xl py-3 mt-4 border border-border/60">
        <span className="flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5 text-primary" />
          <span className="font-medium">Free Shipping $35+</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-primary" />
          <span className="font-medium">30-Day Returns</span>
        </span>
      </div>
    </section>
  );
}
