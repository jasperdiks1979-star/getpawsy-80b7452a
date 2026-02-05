import React from 'react';
import { Truck, RotateCcw, Lock } from 'lucide-react';

interface TrustMicrocopyProps {
  className?: string;
}

/**
 * Trust Microcopy Section - Placed directly below Add-to-Cart button
 * 
 * US-market focused trust signals for cold traffic conversion:
 * - US warehouse shipping (3-7 business days)
 * - 30-day hassle-free returns
 * - Secure checkout with no hidden fees
 */
export const TrustMicrocopy: React.FC<TrustMicrocopyProps> = ({ className = '' }) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <Truck className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>Ships from US warehouse • 3–7 business days</span>
      </div>
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <RotateCcw className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>30-day hassle-free returns</span>
      </div>
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <Lock className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>Secure checkout • No hidden fees</span>
      </div>
    </div>
  );
};

export default TrustMicrocopy;
