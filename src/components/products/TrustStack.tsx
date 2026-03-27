import React from 'react';
import { Truck, Shield, RotateCcw, Lock, Headphones } from 'lucide-react';

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
    { icon: <RotateCcw className="w-4 h-4 text-primary flex-shrink-0" />, text: '30-day returns' },
    { icon: <Truck className="w-4 h-4 text-primary flex-shrink-0" />, text: 'Free shipping over $35' },
    { icon: <Headphones className="w-4 h-4 text-primary flex-shrink-0" />, text: 'US-based support' },
    { icon: <Shield className="w-4 h-4 text-primary flex-shrink-0" />, text: 'Pet-safe materials' },
    { icon: <span className="text-sm flex-shrink-0">🇺🇸</span>, text: 'Ships within 3–7 days' },
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
        <a href="mailto:info@getpawsy.pet" className="text-primary hover:underline">info@getpawsy.pet</a>
      </p>
    </div>
  );
};

export default TrustStack;
