import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APPROVED_FREE_SHIPPING_LINE } from '@/config/merchant-policy';

interface FinalCtaBlockProps {
  onAddToCart: () => void;
  inStock: boolean;
  price: number;
  compareAtPrice?: number | null;
  productName?: string;
  category?: string;
}

/**
 * Neutral closing copy. Category headlines used to promise outcomes
 * ("Less pain", "airline-ready", "Less smell") that no product evidence
 * supports, and keyword matching misfiled ramps as beds.
 */
export function getCtaCopy(_name: string, _category: string): { headline: string; subtext: string } {
  return { headline: 'Ready to Order?', subtext: 'Check the product details and size information above before you buy.' };
}

export function FinalCtaBlock({ onAddToCart, inStock, price, compareAtPrice, productName = '', category = '' }: FinalCtaBlockProps) {
  const copy = getCtaCopy(productName, category);

  return (
    <section className="mt-12 mb-8">
      <div className="rounded-2xl bg-primary/5 border border-primary/15 p-6 md:p-8 text-center">
        <p className="text-lg md:text-xl font-display font-bold text-foreground mb-2">
          {copy.headline}
        </p>
        <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
          {copy.subtext}
        </p>
        
        <div className="flex items-center justify-center gap-3 mb-4">
          <span className="text-2xl font-bold text-primary">${price.toFixed(2)}</span>
          {compareAtPrice && compareAtPrice > price && (
            <span className="text-base text-muted-foreground line-through">${compareAtPrice.toFixed(2)}</span>
          )}
        </div>

        <Button
          size="lg"
          className="h-14 px-10 gap-2 text-base font-bold bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white rounded-xl"
          onClick={onAddToCart}
          disabled={!inStock}
        >
          <ShoppingCart className="w-5 h-5" />
          Buy Now — Free Shipping Available
        </Button>

        <div className="flex justify-center gap-4 mt-4 text-xs text-muted-foreground">
          <span>✔ {APPROVED_FREE_SHIPPING_LINE}</span>
          <span>✔ 30-Day Returns</span>
          <span>✔ Secure Checkout</span>
        </div>
      </div>
    </section>
  );
}

export default FinalCtaBlock;
