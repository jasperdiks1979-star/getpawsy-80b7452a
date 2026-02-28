/**
 * Tiered Incentive Progress Bar
 * Shows current tier + next unlock with animated progress.
 * Lightweight — no external deps beyond lucide icons.
 */
import { Truck, Gift, Sparkles, CheckCircle } from 'lucide-react';
import {
  FREE_SHIPPING_THRESHOLD,
  TIERED_INCENTIVES,
  getApplicableTier,
  getNextTier,
} from '@/lib/shipping-constants';

interface TieredIncentiveBarProps {
  subtotal: number;
}

export const TieredIncentiveBar = ({ subtotal }: TieredIncentiveBarProps) => {
  const currentTier = getApplicableTier(subtotal);
  const nextTier = getNextTier(subtotal);
  const maxThreshold = TIERED_INCENTIVES[TIERED_INCENTIVES.length - 1].threshold;
  const progress = Math.min(100, (subtotal / maxThreshold) * 100);

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
      {/* Current status message */}
      <div className="flex items-center gap-2 text-sm font-medium">
        {currentTier ? (
          <>
            <CheckCircle className="w-4 h-4 text-[hsl(var(--success))] shrink-0" />
            <span className="text-[hsl(var(--success))]">{currentTier.label} Unlocked!</span>
          </>
        ) : (
          <>
            <Truck className="w-4 h-4 text-primary shrink-0" />
            <span className="text-foreground">
              Add <span className="font-bold text-primary">${(FREE_SHIPPING_THRESHOLD - subtotal).toFixed(2)}</span> for free shipping
            </span>
          </>
        )}
      </div>

      {/* Progress bar with tier markers */}
      <div className="relative">
        <div className="h-2 rounded-full bg-border/60 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progress}%`,
              background: currentTier && currentTier.discountPercent > 0
                ? 'hsl(var(--success))'
                : 'hsl(var(--primary))',
            }}
          />
        </div>
        {/* Tier markers */}
        <div className="flex justify-between mt-1">
          {TIERED_INCENTIVES.map((tier) => {
            const position = (tier.threshold / maxThreshold) * 100;
            const isUnlocked = subtotal >= tier.threshold;
            return (
              <div
                key={tier.threshold}
                className="flex flex-col items-center text-center"
                style={{ position: 'absolute', left: `${position}%`, transform: 'translateX(-50%)', top: '10px' }}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    isUnlocked ? 'bg-[hsl(var(--success))]' : 'bg-muted-foreground/30'
                  }`}
                />
                <span className={`text-[10px] mt-0.5 whitespace-nowrap ${
                  isUnlocked ? 'text-[hsl(var(--success))] font-medium' : 'text-muted-foreground'
                }`}>
                  ${tier.threshold}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Next tier teaser */}
      {nextTier && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
          {nextTier.discountPercent > 0 ? (
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
          ) : (
            <Gift className="w-3.5 h-3.5 text-primary shrink-0" />
          )}
          <span>
            Spend <span className="font-semibold text-primary">${nextTier.remaining.toFixed(2)}</span> more to unlock{' '}
            <span className="font-semibold text-foreground">{nextTier.label}</span>
          </span>
        </div>
      )}

      {/* All tiers unlocked */}
      {!nextTier && currentTier && (
        <div className="flex items-center gap-2 text-xs text-[hsl(var(--success))] font-medium pt-1">
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span>All rewards unlocked! Maximum savings applied.</span>
        </div>
      )}

      {/* Active discount callout */}
      {currentTier && currentTier.discountPercent > 0 && (
        <div className="bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/20 rounded-lg p-2 text-xs font-medium text-[hsl(var(--success))] flex items-center gap-2">
          <Gift className="w-3.5 h-3.5 shrink-0" />
          {currentTier.discountPercent}% discount automatically applied to your order!
        </div>
      )}
    </div>
  );
};
