import React from 'react';
import { Truck, RotateCcw, Lock, CreditCard } from 'lucide-react';
import { PaymentBadges } from '@/components/shared/PaymentBadges';
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
        <span>Free shipping to the United States • Orders over ${FREE_SHIPPING_THRESHOLD}</span>
      </div>
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <Lock className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>Estimated delivery: {DELIVERY_TIME_STANDARD} • Tracking included</span>
      </div>
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <RotateCcw className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>{RETURNS_POLICY_SHORT}</span>
      </div>
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <CreditCard className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="mr-1">Secure checkout with encrypted payment processing</span>
        <PaymentBadges showLabel={false} variant="dark" className="gap-1.5" />
      </div>
      <p className="text-[11px] text-muted-foreground/70 mt-2 italic">
        All payments are securely processed using encrypted payment systems.
      </p>
    </div>
  );
};

export default TrustMicrocopy;
