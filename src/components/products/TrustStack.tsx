import React from 'react';
import { Star, Truck, Shield, RotateCcw } from 'lucide-react';

interface TrustStackProps {
  className?: string;
}

/**
 * High-conversion trust stack — displayed immediately below the primary CTA.
 * Compact, scannable, mobile-first.
 */
export const TrustStack: React.FC<TrustStackProps> = ({ className = '' }) => {
  return (
    <div className={`space-y-3 ${className}`}>
      {/* Social proof line */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="w-3.5 h-3.5 text-warning fill-warning" />
          ))}
        </div>
        <span className="text-sm font-medium text-foreground">Loved by 1,000+ pet owners</span>
      </div>

      {/* Trust badges grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
          <Shield className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-xs font-medium text-foreground">Safe & secure checkout</span>
        </div>
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
          <RotateCcw className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-xs font-medium text-foreground">30-day return policy</span>
        </div>
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
          <Truck className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-xs font-medium text-foreground">Fast US delivery (3–7 days)</span>
        </div>
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
          <span className="text-sm flex-shrink-0">🇺🇸</span>
          <span className="text-xs font-medium text-foreground">Ships from USA</span>
        </div>
      </div>
    </div>
  );
};

export default TrustStack;
