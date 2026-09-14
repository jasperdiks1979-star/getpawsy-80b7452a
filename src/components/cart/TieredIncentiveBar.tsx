/**
 * Tiered Incentive Progress Bar
 *
 * Display logic is derived entirely from `getCartIncentiveState` so it can
 * never diverge from the amount actually charged. Percentage tiers are VOLUME
 * rewards and require 2+ units; free shipping depends on subtotal only.
 */
import { Truck, Gift, Sparkles, CheckCircle, PackagePlus } from 'lucide-react';
import { TIERED_INCENTIVES, getCartIncentiveState } from '@/lib/shipping-constants';

interface TieredIncentiveBarProps {
  subtotal: number;
  /** Total units in cart. Percentage tiers require 2+ units. */
  unitCount?: number;
}

export const TieredIncentiveBar = ({ subtotal, unitCount = 2 }: TieredIncentiveBarProps) => {
  const state = getCartIncentiveState(subtotal, unitCount);
  const { currentTier, nextTier, pendingVolumeTier } = state;
  const maxThreshold = TIERED_INCENTIVES[TIERED_INCENTIVES.length - 1].threshold;
  const progress = Math.min(100, Math.max(0, (subtotal / maxThreshold) * 100));

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
              Add{' '}
              <span className="font-bold text-primary">
                ${state.freeShippingRemaining.toFixed(2)}
              </span>{' '}
              for free shipping
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
        {/* Tier markers — a percentage marker only reads as unlocked when the
            volume rule is satisfied too. */}
        <div className="flex justify-between mt-1">
          {TIERED_INCENTIVES.map((tier) => {
            const position = (tier.threshold / maxThreshold) * 100;
            const isUnlocked =
              subtotal >= tier.threshold &&
              (tier.discountPercent === 0 || state.volumeEligible);
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

      {/* Volume teaser — spend already qualifies, only the item count is short */}
      {pendingVolumeTier && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
          <PackagePlus className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>
            Add{' '}
            <span className="font-semibold text-primary">
              {state.unitsNeededForVolume} more item
              {state.unitsNeededForVolume === 1 ? '' : 's'}
            </span>{' '}
            to unlock{' '}
            <span className="font-semibold text-foreground">{pendingVolumeTier.label}</span> —
            volume savings apply to orders of 2 or more items.
          </span>
        </div>
      )}

      {/* Next tier teaser */}
      {!pendingVolumeTier && nextTier && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
          {nextTier.discountPercent > 0 ? (
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
          ) : (
            <Gift className="w-3.5 h-3.5 text-primary shrink-0" />
          )}
          <span>
            Spend <span className="font-semibold text-primary">${nextTier.remaining.toFixed(2)}</span> more to unlock{' '}
            <span className="font-semibold text-foreground">{nextTier.label}</span>
            {nextTier.requiresMoreUnits && ' (orders of 2 or more items)'}
          </span>
        </div>
      )}

      {/* All tiers unlocked */}
      {state.allRewardsUnlocked && (
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
