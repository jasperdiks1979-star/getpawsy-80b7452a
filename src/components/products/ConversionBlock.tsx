/**
 * Above-the-fold conversion block for PDPs.
 * Shows "Best for" context, social proof, and key trust signals.
 * Displayed between price and benefit bullets.
 */
import { memo, useMemo } from 'react';
import { Flame, Users, Truck, ShieldCheck, Clock, TrendingUp } from 'lucide-react';
import { FREE_SHIPPING_THRESHOLD } from '@/lib/shipping-constants';
import { getWinnerBadge } from '@/config/top-winners';

interface ConversionBlockProps {
  productName: string;
  category?: string;
  productId?: string;
  /** Override "Best for" bullets from ad intent */
  bestForOverride?: string[];
  /**
   * When true, the shipping / delivery / returns triplet is hidden because
   * another surface (e.g. MobileStickyTrustBar) already conveys those
   * signals. Keeps the block focused on unique value: Best-for + social proof.
   */
  trustCompact?: boolean;
}

function getBestFor(name: string, category?: string): string[] {
  const c = `${name} ${category || ''}`.toLowerCase();

  if (/cooling|elevated|cot|outdoor/i.test(c) && /dog|bed/i.test(c))
    return ['Large dogs', 'Warm climates & summer', 'Indoor & outdoor use'];
  if (/car\s*bed|rear\s*seat|travel\s*pad/i.test(c))
    return ['Road trips & errands', 'Dogs who ride in cars', 'Rear seat comfort'];
  if (/stroller/i.test(c))
    return ['Senior & small dogs', 'Post-surgery recovery', 'Daily outdoor walks'];
  if (/carrier|backpack/i.test(c))
    return ['Small dogs & cats', 'Hiking & travel', 'Airline cabin carry-on'];
  if (/orthopedic|memory\s*foam/i.test(c))
    return ['Senior dogs', 'Joint & hip support', 'Post-surgery recovery'];
  if (/dog\s*bed|pet\s*bed/i.test(c))
    return ['Medium to large dogs', 'Daily comfort', 'Indoor relaxation'];
  if (/cat\s*tree|cat\s*condo|cat\s*tower/i.test(c))
    return ['Active indoor cats', 'Multi-cat households', 'Scratching & climbing'];
  if (/litter/i.test(c))
    return ['Busy cat owners', 'Multi-cat homes', 'Odor-sensitive spaces'];
  if (/toy|chew/i.test(c))
    return ['Active & bored dogs', 'Aggressive chewers', 'Mental stimulation'];

  return ['Pet comfort', 'Daily use', 'US pet owners'];
}

export const ConversionBlock = memo(function ConversionBlock({ productName, category, productId, bestForOverride, trustCompact = false }: ConversionBlockProps) {
  const bestFor = useMemo(() => bestForOverride && bestForOverride.length > 0 ? bestForOverride : getBestFor(productName, category), [productName, category, bestForOverride]);
  const winnerBadge = productId ? getWinnerBadge(productId) : undefined;

  return (
    <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 space-y-2.5">
      {/* Winner Badge */}
      {winnerBadge && (
        <div className="flex items-center gap-2 pb-1">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wide">
            <TrendingUp className="w-3 h-3" />
            {winnerBadge.label}
          </span>
        </div>
      )}

      {/* Best For */}
      <div className="flex items-start gap-2">
        <Flame className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
        <p className="text-sm text-foreground">
          <span className="font-semibold">Best for:</span>{' '}
          {bestFor.join(' · ')}
        </p>
      </div>

      {/* Shipping */}
      {!trustCompact && <div className="flex items-center gap-2">
        <Truck className="w-4 h-4 text-primary flex-shrink-0" />
        <p className="text-sm text-muted-foreground">
          Free US shipping on orders over ${FREE_SHIPPING_THRESHOLD}
        </p>
      </div>}

      {/* Estimated delivery */}
      {!trustCompact && <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-primary flex-shrink-0" />
        <p className="text-sm text-muted-foreground">
          Estimated delivery: 5–10 business days
        </p>
      </div>}

      {/* Risk-free */}
      {!trustCompact && <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0" />
        <p className="text-sm text-muted-foreground">
          30-day risk-free returns
        </p>
      </div>}
    </div>
  );
});
