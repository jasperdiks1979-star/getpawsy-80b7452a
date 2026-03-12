import React from 'react';
import { Truck, RotateCcw, Lock, CreditCard, Mail } from 'lucide-react';
import { PaymentBadges } from '@/components/shared/PaymentBadges';
import { Link } from 'react-router-dom';
import {
  FREE_SHIPPING_THRESHOLD,
  DELIVERY_TIME_STANDARD,
  RETURNS_POLICY_SHORT,
  SUPPORT_EMAIL,
} from '@/lib/shipping-constants';

interface TrustMicrocopyProps {
  className?: string;
}

/**
 * Trust Microcopy Section - Placed directly below Add-to-Cart button
 * 
 * Google Merchant Center compliance trust signals for cold traffic conversion.
 * Uses centralized shipping constants for consistency.
 */
export const TrustMicrocopy: React.FC<TrustMicrocopyProps> = ({ className = '' }) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <Lock className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>Secure Checkout</span>
      </div>
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <CreditCard className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>Visa, Mastercard, Apple Pay, Google Pay</span>
      </div>
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <Truck className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>Shipping: {DELIVERY_TIME_STANDARD}</span>
      </div>
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <RotateCcw className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>Returns: {RETURNS_POLICY_SHORT}</span>
      </div>
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <Mail className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>Support: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">{SUPPORT_EMAIL}</a></span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground pt-1">
        <Link to="/returns" className="text-primary hover:underline">Return Policy</Link>
        <span>·</span>
        <Link to="/shipping" className="text-primary hover:underline">Shipping Policy</Link>
      </div>
    </div>
  );
};

export default TrustMicrocopy;
