import React from 'react';
import { Truck, RotateCcw, Lock, DollarSign } from 'lucide-react';
import {
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  DELIVERY_TIME_STANDARD,
  RETURNS_POLICY_SHORT,
} from '@/lib/shipping-constants';

interface TrustMicrocopyProps {
  className?: string;
}

/**
 * Trust Microcopy Section - Placed directly below Add-to-Cart button
 * 
 * US-market focused trust signals for cold traffic conversion.
 * Uses centralized shipping constants for Google Merchant Center consistency.
 */
export const TrustMicrocopy: React.FC<TrustMicrocopyProps> = ({ className = '' }) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <Truck className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>Ships from U.S. fulfillment partners • {DELIVERY_TIME_STANDARD}</span>
      </div>
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <DollarSign className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>Free shipping on orders ${FREE_SHIPPING_THRESHOLD}+ • ${FLAT_SHIPPING_RATE.toFixed(2)} under</span>
      </div>
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <RotateCcw className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>{RETURNS_POLICY_SHORT}</span>
      </div>
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <Lock className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>Secure checkout • No hidden fees</span>
      </div>
    </div>
  );
};

export default TrustMicrocopy;
