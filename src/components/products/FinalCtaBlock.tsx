import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FinalCtaBlockProps {
  onAddToCart: () => void;
  inStock: boolean;
  price: number;
  compareAtPrice?: number | null;
}

/**
 * Final CTA block — appears after all product info sections.
 * Emotional trigger + prominent Add to Cart + trust summary.
 */
export function FinalCtaBlock({ onAddToCart, inStock, price, compareAtPrice }: FinalCtaBlockProps) {
  return (
    <section className="mt-12 mb-8">
      <div className="rounded-2xl bg-primary/5 border border-primary/15 p-6 md:p-8 text-center">
        <p className="text-lg md:text-xl font-display font-bold text-foreground mb-2">
          Ready for stress-free walks?
        </p>
        <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
          Enjoy relaxed walks again — without frustration or constant pulling.
        </p>
        
        <div className="flex items-center justify-center gap-3 mb-4">
          <span className="text-2xl font-bold text-primary">${price.toFixed(2)}</span>
          {compareAtPrice && compareAtPrice > price && (
            <span className="text-base text-muted-foreground line-through">${compareAtPrice.toFixed(2)}</span>
          )}
        </div>

        <Button
          size="lg"
          className="h-12 px-10 gap-2 text-base font-semibold bg-primary hover:bg-primary/90"
          onClick={onAddToCart}
          disabled={!inStock}
        >
          <ShoppingCart className="w-5 h-5" />
          Add to Cart – Secure Checkout
        </Button>

        <div className="flex justify-center gap-4 mt-4 text-xs text-muted-foreground">
          <span>✔ Free Shipping</span>
          <span>✔ 30-Day Returns</span>
          <span>✔ Secure Checkout</span>
        </div>
      </div>
    </section>
  );
}

export default FinalCtaBlock;
