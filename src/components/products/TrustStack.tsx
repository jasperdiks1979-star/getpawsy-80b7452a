import React from 'react';
import { Truck, Shield, RotateCcw, Lock, Headphones } from 'lucide-react';
import {
  FREE_SHIPPING_THRESHOLD,
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
  SUPPORT_EMAIL,
} from '@/lib/shipping-constants';

interface TrustStackProps {
  className?: string;
}

/**
 * High-conversion trust stack — displayed immediately below the primary CTA.
 * Compact, scannable, mobile-first. No fake claims.
 */
export const TrustStack: React.FC<TrustStackProps> = ({ className = '' }) => {
  const badges = [
    { icon: <Lock className="w-4 h-4 text-primary flex-shrink-0" />, text: 'Secure checkout (Stripe)' },
    { icon: <RotateCcw className="w-4 h-4 text-primary flex-shrink-0" />, text: `${RETURN_WINDOW_DAYS}-day returns` },
    { icon: <Truck className="w-4 h-4 text-primary flex-shrink-0" />, text: `Free shipping over $${FREE_SHIPPING_THRESHOLD}` },
    { icon: <Headphones className="w-4 h-4 text-primary flex-shrink-0" />, text: 'Dedicated support team' },
    { icon: <Shield className="w-4 h-4 text-primary flex-shrink-0" />, text: 'Pet-safe materials' },
    { icon: <span className="text-sm flex-shrink-0">🇺🇸</span>, text: `Estimated delivery: ${DELIVERY_TIME_STANDARD}` },
  ];

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Trust badges grid */}
      <div className="grid grid-cols-2 gap-2">
        {badges.map((badge, i) => (
          <div key={i} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2.5">
            {badge.icon}
            <span className="text-xs font-medium text-foreground">{badge.text}</span>
          </div>
        ))}
      </div>

      {/* Support contact */}
      <p className="text-xs text-muted-foreground text-center">
        Questions? Email us at{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">{SUPPORT_EMAIL}</a>
      </p>
    </div>
  );
};

export default TrustStack;
