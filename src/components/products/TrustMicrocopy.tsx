import React from 'react';
import { Link } from 'react-router-dom';
import {
  FREE_SHIPPING_THRESHOLD,
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
  SUPPORT_EMAIL,
  BUSINESS_OPERATOR,
  BUSINESS_LOCATION,
  SITE_LAST_UPDATED,
} from '@/lib/shipping-constants';

interface TrustMicrocopyProps {
  className?: string;
}

/**
 * Trust Microcopy — trust bullets + business identity below Add to Cart.
 * Google Merchant Center compliance: contact, shipping, returns, identity.
 */
export const TrustMicrocopy: React.FC<TrustMicrocopyProps> = ({ className = '' }) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-primary flex-shrink-0">✔</span>
        <span>Free shipping on eligible orders ${FREE_SHIPPING_THRESHOLD}+ ({DELIVERY_TIME_STANDARD})</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-primary flex-shrink-0">✔</span>
        <span>{RETURN_WINDOW_DAYS}-Day Returns</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-primary flex-shrink-0">✔</span>
        <span>Secure Checkout via Stripe</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-primary flex-shrink-0">✔</span>
        <span>
          Support:{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground/70 pt-1 flex-wrap">
        <Link to="/shipping" className="hover:text-primary transition-colors">Shipping Info</Link>
        <span>·</span>
        <Link to="/returns" className="hover:text-primary transition-colors">Return Policy</Link>
        <span>·</span>
        <Link to="/contact" className="hover:text-primary transition-colors">Contact</Link>
      </div>
      <p className="text-[10px] text-muted-foreground/50 pt-1">
        GetPawsy · {BUSINESS_OPERATOR} · {BUSINESS_LOCATION} · Updated {SITE_LAST_UPDATED}
      </p>
    </div>
  );
};

export default TrustMicrocopy;
