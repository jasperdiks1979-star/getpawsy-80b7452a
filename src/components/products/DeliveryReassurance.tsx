import React from 'react';
import { Truck, Package, RotateCcw, Clock } from 'lucide-react';
import {
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  DELIVERY_TIME_STANDARD,
  PROCESSING_TIME,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';

interface DeliveryReassuranceProps {
  className?: string;
}

/**
 * Mid-page Delivery & Returns Reassurance Section
 * 
 * Provides factual, calm shipping information to reduce purchase anxiety
 * for cold traffic (especially Pinterest browsers).
 * 
 * This section appears mid-page to reinforce trust after the product description.
 */
export const DeliveryReassurance: React.FC<DeliveryReassuranceProps> = ({ className = '' }) => {
  return (
    <div className={`bg-muted/40 rounded-2xl p-6 ${className}`}>
      <h3 className="text-lg font-display font-semibold text-foreground mb-4 flex items-center gap-2">
        <Truck className="w-5 h-5 text-primary" />
        Delivery & Returns
      </h3>
      
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Processing Time */}
        <div className="flex items-start gap-3">
          <Clock className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-foreground text-sm">Processing</p>
            <p className="text-sm text-muted-foreground">{PROCESSING_TIME}</p>
          </div>
        </div>
        
        {/* Delivery Time */}
        <div className="flex items-start gap-3">
          <Package className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-foreground text-sm">Delivery</p>
            <p className="text-sm text-muted-foreground">{DELIVERY_TIME_STANDARD}</p>
          </div>
        </div>
        
        {/* Shipping Cost */}
        <div className="flex items-start gap-3">
          <Truck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-foreground text-sm">Shipping</p>
            <p className="text-sm text-muted-foreground">
              Free over ${FREE_SHIPPING_THRESHOLD} • ${FLAT_SHIPPING_RATE.toFixed(2)} flat rate under
            </p>
          </div>
        </div>
        
        {/* Returns */}
        <div className="flex items-start gap-3">
          <RotateCcw className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-foreground text-sm">{RETURN_WINDOW_DAYS}-Day Returns</p>
            <p className="text-sm text-muted-foreground">Hassle-free returns if not satisfied</p>
          </div>
        </div>
      </div>
    </div>
  );
};
