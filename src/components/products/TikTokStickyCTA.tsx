/**
 * TikTokStickyCTA — persistent bottom mobile CTA shown only on TikTok ad
 * landings of the litter-box PDP. Hides itself when the buy box is on screen
 * to avoid duplication. Compliant: no fake urgency.
 */
import { useEffect, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onCtaClick: () => void;
  inStock: boolean;
  price: number;
}

export function TikTokStickyCTA({ onCtaClick, inStock, price }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const buy = document.getElementById('pdp-buy-box');
    if (!buy || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { rootMargin: '-20% 0px -20% 0px' },
    );
    io.observe(buy);
    return () => io.disconnect();
  }, []);

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Quick checkout"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-3 py-2.5 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-[0_-6px_20px_-10px_rgba(0,0,0,0.25)]"
    >
      <div className="flex items-center gap-3">
        <div className="flex flex-col leading-tight">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Today</span>
          <span className="text-base font-bold text-foreground">${price.toFixed(2)}</span>
        </div>
        <Button
          onClick={onCtaClick}
          disabled={!inStock}
          className="ml-auto h-12 flex-1 gap-2 text-sm font-bold bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white rounded-xl"
        >
          <ShoppingCart className="w-4 h-4" />
          Get Yours Today
        </Button>
      </div>
    </div>
  );
}

export default TikTokStickyCTA;
