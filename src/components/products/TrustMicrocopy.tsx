import React from 'react';
import { Link } from 'react-router-dom';
import {
  FREE_SHIPPING_THRESHOLD,
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';

interface TrustMicrocopyProps {
  className?: string;
}

/**
 * Trust Microcopy — exactly 3 trust bullets below Add to Cart.
 * Clean, scannable, no clutter.
 */
export const TrustMicrocopy: React.FC<TrustMicrocopyProps> = ({ className = '' }) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-primary flex-shrink-0">✔</span>
        <span>Free US Shipping ({DELIVERY_TIME_STANDARD})</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-primary flex-shrink-0">✔</span>
        <span>{RETURN_WINDOW_DAYS}-Day Risk-Free Returns</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-primary flex-shrink-0">✔</span>
        <span>Secure Checkout via Stripe</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground/70 pt-1">
        <Link to="/shipping" className="hover:text-primary transition-colors">Shipping Info</Link>
        <span>·</span>
        <Link to="/returns" className="hover:text-primary transition-colors">Return Policy</Link>
      </div>
    </div>
  );
};

export default TrustMicrocopy;
