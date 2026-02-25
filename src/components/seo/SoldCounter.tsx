import { TrendingUp } from 'lucide-react';
import { useMemo } from 'react';

interface SoldCounterProps {
  productId: string;
  productPrice: number;
}

/**
 * Deterministic "sold this week" counter based on product ID hash + price tier.
 * Generates a stable number per product that doesn't change within the same week.
 */
export function SoldCounter({ productId, productPrice }: SoldCounterProps) {
  const count = useMemo(() => {
    // Simple hash from product ID for deterministic output
    let hash = 0;
    for (let i = 0; i < productId.length; i++) {
      hash = ((hash << 5) - hash) + productId.charCodeAt(i);
      hash |= 0;
    }
    // Weekly seed so number changes each week
    const weekSeed = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    const combined = Math.abs(hash ^ weekSeed);
    
    // Higher price = lower volume, lower price = higher volume
    const base = productPrice > 150 ? 8 : productPrice > 80 ? 15 : productPrice > 40 ? 25 : 40;
    return base + (combined % 20);
  }, [productId, productPrice]);

  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
      <TrendingUp className="w-2.5 h-2.5 text-primary" />
      <span>{count} sold this week</span>
    </div>
  );
}
