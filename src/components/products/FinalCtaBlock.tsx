import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FinalCtaBlockProps {
  onAddToCart: () => void;
  inStock: boolean;
  price: number;
  compareAtPrice?: number | null;
  productName?: string;
  category?: string;
}

function getCtaCopy(name: string, category: string): { headline: string; subtext: string } {
  const c = `${name} ${category}`.toLowerCase();
  if (/litter\s*box|self[\s-]*clean|automatic\s*litter/i.test(c)) {
    return { headline: 'Upgrade Your Cat\'s Hygiene Today', subtext: 'Less work. Less smell. More comfort.' };
  }
  if (/cat\s*tree|cat\s*condo|scratching/i.test(c)) {
    return { headline: 'Give Your Cat the Space They Deserve', subtext: 'Climbing, scratching, and napping — all in one.' };
  }
  if (c.includes('harness')) {
    return { headline: 'Ready for Stress-Free Walks?', subtext: 'Enjoy relaxed walks again — without pulling or choking.' };
  }
  if (c.includes('bed') || c.includes('cushion')) {
    return { headline: 'Give Your Dog the Sleep They Deserve', subtext: 'Better rest. Less pain. More energy every morning.' };
  }
  if (c.includes('carrier') || c.includes('crate')) {
    return { headline: 'Travel Stress-Free With Your Pet', subtext: 'Safe, comfortable, and airline-ready.' };
  }
  if (c.includes('car seat') || c.includes('car')) {
    return { headline: 'Make Every Car Ride Safer', subtext: 'Comfort and safety for your dog on the road.' };
  }
  if (c.includes('paw') || c.includes('cleaner')) {
    return { headline: 'Keep Your Home Clean in Seconds', subtext: 'No more muddy paw prints on your floors.' };
  }
  return { headline: 'Your Pet Deserves the Best', subtext: 'Quality products that make a real difference.' };
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
          Buy Now — Free US Shipping
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
