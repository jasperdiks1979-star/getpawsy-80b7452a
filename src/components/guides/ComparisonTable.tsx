import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import type { ComparisonProduct } from '@/types/guide';

interface Props {
  products: ComparisonProduct[];
}

export function ComparisonTable({ products }: Props) {
  if (!products.length) return null;

  return (
    <section className="mb-10">
      <h2 className="text-2xl font-display font-bold text-foreground mb-6">
        Product Comparison
      </h2>
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(products.length, 4)}, minmax(200px, 1fr))` }}>
          {products.map((product, i) => (
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
              {product.image && (
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-32 object-contain mb-3 rounded-lg bg-muted/30"
                  loading="lazy"
                />
              )}
              <h3 className="font-semibold text-foreground text-sm mb-1">{product.name}</h3>
              <p className="text-lg font-bold text-foreground mb-3">{product.price}</p>
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
