import { Truck, Package } from 'lucide-react';
import { PROCESSING_TIME, DELIVERY_TIME_STANDARD } from '@/lib/shipping-constants';

interface ShippingCountdownProps {
  className?: string;
}

/**
 * ShippingCountdown - Displays processing and delivery time info
 * 
 * Uses CSS animation instead of framer-motion to reduce JS bundle.
 */
export const ShippingCountdown = ({ className = '' }: ShippingCountdownProps) => {
  return (
    <div
      className={`flex flex-col gap-2 p-3 rounded-xl bg-muted/50 border border-border animate-fade-in ${className}`}
    >
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-primary flex-shrink-0" />
        <p className="text-sm text-foreground">
          <span className="font-medium">Processing:</span>{' '}
          <span className="text-muted-foreground">{PROCESSING_TIME}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Truck className="h-4 w-4 text-primary flex-shrink-0" />
        <p className="text-sm text-foreground">
          <span className="font-medium">Estimated Delivery:</span>{' '}
          <span className="text-muted-foreground">{DELIVERY_TIME_STANDARD}</span>
        </p>
      </div>
    </div>
  );
};
