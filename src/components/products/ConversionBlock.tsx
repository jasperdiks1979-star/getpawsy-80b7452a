/**
 * Above-the-fold conversion block for PDPs.
 * Shows "Best for" context, social proof, and key trust signals.
 * Displayed between price and benefit bullets.
 */
import { memo, useMemo } from 'react';
import { Flame, Users, Truck, ShieldCheck } from 'lucide-react';
import { FREE_SHIPPING_THRESHOLD } from '@/lib/shipping-constants';

interface ConversionBlockProps {
  productName: string;
  category?: string;
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

export const ConversionBlock = memo(function ConversionBlock({ productName, category }: ConversionBlockProps) {
  const bestFor = useMemo(() => getBestFor(productName, category), [productName, category]);

  return (
    <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 space-y-2.5">
      {/* Best For */}
      <div className="flex items-start gap-2">
        <Flame className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
        <p className="text-sm text-foreground">
          <span className="font-semibold">Best for:</span>{' '}
          {bestFor.join(' · ')}
        </p>
      </div>

      {/* Social proof */}
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-primary flex-shrink-0" />
        <p className="text-sm text-muted-foreground">
          Trusted by pet owners across the United States
        </p>
      </div>

      {/* Shipping */}
      <div className="flex items-center gap-2">
        <Truck className="w-4 h-4 text-primary flex-shrink-0" />
        <p className="text-sm text-muted-foreground">
          Free US shipping on orders over ${FREE_SHIPPING_THRESHOLD}
        </p>
      </div>

      {/* Risk-free */}
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0" />
        <p className="text-sm text-muted-foreground">
          30-day risk-free returns
        </p>
      </div>
    </div>
  );
});
