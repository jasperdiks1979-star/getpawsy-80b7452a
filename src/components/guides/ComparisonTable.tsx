import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import type { ComparisonProduct } from '@/types/guide';

interface Props {
  products: ComparisonProduct[];
}

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
      <h2 className="text-2xl font-display font-bold text-foreground mb-6">
        Product Comparison
      </h2>
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(valid.length, 4)}, minmax(200px, 1fr))` }}>
          {valid.map((product, i) => (
            <div
              key={i}
              className={`relative bg-card rounded-xl border p-5 flex flex-col ${
                product.badge ? 'border-primary shadow-sm' : 'border-border'
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
              <p className="text-lg font-bold text-foreground mb-1">{product.price}</p>
              {product.availability && (
                <span className={`text-xs font-medium mb-3 inline-block ${
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
              <Link
                to={product.link}
                className="w-full text-center bg-primary text-primary-foreground text-sm font-medium py-2.5 rounded-lg hover:opacity-90 transition-opacity"
              >
                View Product
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
