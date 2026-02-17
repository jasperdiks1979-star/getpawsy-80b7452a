import React from 'react';
import { Truck, RotateCcw, Lock, CreditCard } from 'lucide-react';
import {
  FREE_SHIPPING_THRESHOLD,
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
        <span>Free US Shipping over ${FREE_SHIPPING_THRESHOLD} • {DELIVERY_TIME_STANDARD}</span>
      </div>
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <RotateCcw className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>{RETURNS_POLICY_SHORT}</span>
      </div>
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <CreditCard className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>Secure Checkout • Visa • Mastercard • Apple Pay</span>
      </div>
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <Lock className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>Encrypted payments • No hidden fees</span>
      </div>
    </div>
  );
};

export default TrustMicrocopy;
