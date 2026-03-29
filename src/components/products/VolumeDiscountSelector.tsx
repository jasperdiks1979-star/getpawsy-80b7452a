import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Check, Star, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface VolumeDiscountSelectorProps {
  basePrice: number;
  onQuantityChange: (quantity: number, discountPercent: number) => void;
  selectedQuantity?: number;
  /** Context label — defaults to generic pet copy */
  contextLabel?: string;
}

interface VolumeTier {
  quantity: number;
  discount: number;
  label: string;
  sublabel: string;
  isBestValue?: boolean;
}

// Volume discount tiers — aggressive AOV strategy
const VOLUME_TIERS: VolumeTier[] = [
  { quantity: 1, discount: 0, label: 'Buy 1', sublabel: 'Standard price' },
  { quantity: 2, discount: 15, label: 'Buy 2', sublabel: 'Save 15%', isBestValue: true },
  { quantity: 3, discount: 25, label: 'Buy 3', sublabel: 'Save 25%' },
];

export const VolumeDiscountSelector = ({
  basePrice,
  onQuantityChange,
  selectedQuantity = 1,
  contextLabel,
}: VolumeDiscountSelectorProps) => {
  const [selected, setSelected] = useState<VolumeTier>(
    VOLUME_TIERS.find(t => t.quantity === selectedQuantity) || VOLUME_TIERS[0]
  );

  const handleSelect = useCallback((tier: VolumeTier) => {
    if (tier.quantity === selected.quantity) return; // no-op guard
    setSelected(tier);
    onQuantityChange(tier.quantity, tier.discount);
  }, [selected.quantity, onQuantityChange]);

  // Calculate prices for each tier
  const tiersWithPrices = useMemo(() => {
    return VOLUME_TIERS.map(tier => {
      const totalPrice = basePrice * tier.quantity;
      const discountedPrice = totalPrice * (1 - tier.discount / 100);
      const savings = totalPrice - discountedPrice;
      const pricePerItem = discountedPrice / tier.quantity;
      return {
        ...tier,
        totalPrice,
        discountedPrice,
        savings,
        pricePerItem,
      };
    });
  }, [basePrice]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Buy More, Save More</h3>
        <span className="text-xs text-muted-foreground">
          {contextLabel || 'Great value for pet owners'}
        </span>
      </div>

      {/* Tier Options */}
      <div className="grid grid-cols-3 gap-2">
        {tiersWithPrices.map((tier) => {
          const isSelected = selected.quantity === tier.quantity;
          
          return (
            <motion.button
              key={tier.quantity}
              onClick={() => handleSelect(tier)}
              className={`
                relative p-3 rounded-xl border-2 transition-all text-left
                ${isSelected 
                  ? 'border-primary bg-primary/5 shadow-md' 
                  : 'border-muted bg-card hover:border-primary/50'
                }
                ${tier.isBestValue ? 'ring-2 ring-amber-400/50' : ''}
              `}
              whileTap={{ scale: 0.98 }}
            >
              {/* Best Value Badge */}
              {tier.isBestValue && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] px-2 py-0.5 shadow-sm">
                    <Star className="w-2.5 h-2.5 mr-0.5 fill-white" />
                    Best Value
                  </Badge>
                </div>
              )}

              {/* Selection indicator */}
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center"
                >
                  <Check className="w-3 h-3 text-primary-foreground" />
                </motion.div>
              )}

              {/* Content */}
              <div className={tier.isBestValue ? 'pt-1' : ''}>
                <p className="font-semibold text-sm">{tier.label}</p>
                <p className="text-xs text-muted-foreground">{tier.sublabel}</p>
                
                <div className="mt-2 space-y-0.5">
                  {tier.discount > 0 && (
                    <p className="text-xs text-muted-foreground line-through">
                      ${tier.totalPrice.toFixed(2)}
                    </p>
                  )}
                  <p className="text-base font-bold text-primary">
                    ${tier.discountedPrice.toFixed(2)}
                  </p>
                  {tier.discount > 0 && (
                    <p className="text-[10px] text-green-600 dark:text-green-400 font-medium">
                      ${tier.pricePerItem.toFixed(2)}/each
                    </p>
                  )}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Savings highlight */}
      {selected.discount > 0 && (
        <motion.div
          key={selected.quantity}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 py-2 px-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800"
        >
          <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
          <span className="text-sm font-medium text-green-700 dark:text-green-300">
            You save ${((basePrice * selected.quantity) * selected.discount / 100).toFixed(2)} with this bundle!
          </span>
        </motion.div>
      )}
    </div>
  );
};
