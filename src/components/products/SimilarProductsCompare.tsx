/**
 * "Compare With Similar" mini-module — shows 3 related Tier A products
 * with key specs (price, weight capacity, best-for tag) and quick-add.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { useCart } from '@/contexts/CartContext';
import { toast } from 'sonner';

interface CompareProduct {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  slug?: string | null;
  category?: string | null;
  weight?: number | null;
}

interface SimilarProductsCompareProps {
  products: CompareProduct[];
  currentProductName: string;
}

const CAT_TREE_RE = /cat\s*tree|cat\s*condo|cat\s*tower|scratching|cat\s*furniture/i;
const LITTER_RE = /litter|self[\s-]*clean/i;

function getBestFor(name: string, price: number): string {
  const n = name.toLowerCase();
  if (/large|heavy|maine\s*coon|xl|sturdy/i.test(n)) return 'Large Cats';
  if (/multi/i.test(n) || price >= 150) return 'Multi-Cat Homes';
  if (/small|compact|apartment|mini/i.test(n)) return 'Small Spaces';
  if (/kitten|young/i.test(n)) return 'Kittens';
  return price >= 120 ? 'Multi-Cat Homes' : 'Standard Use';
}

function getWeightCap(name: string, price: number): string {
  if (/heavy|large|xl|maine/i.test(name) || price >= 150) return '30+ lbs';
  if (price >= 100) return '25 lbs';
  if (price >= 70) return '20 lbs';
  return '15 lbs';
}

export function SimilarProductsCompare({ products, currentProductName }: SimilarProductsCompareProps) {
  const { addItem } = useCart();

  // Only show for cat trees / litter
  const isCatProduct = CAT_TREE_RE.test(currentProductName) || LITTER_RE.test(currentProductName);
  const displayProducts = useMemo(() => products.slice(0, 3), [products]);

  if (!isCatProduct || displayProducts.length < 2) return null;

  const isCatTree = CAT_TREE_RE.test(currentProductName);

  const handleQuickAdd = (p: CompareProduct) => {
    addItem({
      id: p.id,
      slug: p.slug ?? undefined,
      name: p.name,
      price: p.price,
      image: p.image_url || '/placeholder.svg',
    });
    toast.success(`${p.name} added to cart!`);
  };

  return (
    <section className="mt-8 rounded-2xl border border-border/50 bg-muted/20 p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">
        Compare With Similar {isCatTree ? 'Cat Trees' : 'Litter Boxes'}
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-2 px-2 font-medium text-muted-foreground">Product</th>
              <th className="text-center py-2 px-2 font-medium text-muted-foreground">Price</th>
              {isCatTree && (
                <th className="text-center py-2 px-2 font-medium text-muted-foreground">Weight Cap</th>
              )}
              <th className="text-center py-2 px-2 font-medium text-muted-foreground">Best For</th>
              <th className="text-center py-2 px-2 font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody>
            {displayProducts.map((p) => (
              <tr key={p.id} className="border-b border-border/30 last:border-0">
                <td className="py-3 px-2">
                  <Link
                    to={`/product/${p.slug || p.id}`}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    <OptimizedImage
                      src={p.image_url || '/placeholder.svg'}
                      alt={p.name}
                      className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                      width={40}
                      height={40}
                    />
                    <span className="font-medium line-clamp-2 max-w-[140px]">{p.name}</span>
                  </Link>
                </td>
                <td className="text-center py-3 px-2 font-semibold text-primary">
                  ${p.price.toFixed(2)}
                </td>
                {isCatTree && (
                  <td className="text-center py-3 px-2 text-muted-foreground">
                    {getWeightCap(p.name, p.price)}
                  </td>
                )}
                <td className="text-center py-3 px-2">
                  <Badge variant="outline" className="text-xs">
                    {getBestFor(p.name, p.price)}
                  </Badge>
                </td>
                <td className="text-center py-3 px-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-xs"
                    onClick={() => handleQuickAdd(p)}
                  >
                    <ShoppingCart className="w-3 h-3" />
                    Add
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
