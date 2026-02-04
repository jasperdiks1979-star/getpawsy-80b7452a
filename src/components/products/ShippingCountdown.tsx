import { Truck, Package } from 'lucide-react';
import { motion } from 'framer-motion';
import { PROCESSING_TIME, DELIVERY_TIME_STANDARD } from '@/lib/shipping-constants';

interface ShippingCountdownProps {
  className?: string;
}

/**
 * ShippingCountdown - Displays processing and delivery time info
 * 
 * REMOVED: "same-day shipping" and "Order tomorrow before 3:00 PM" messaging
 * REPLACED WITH: Factual processing and delivery times per shipping policy
 */
export const ShippingCountdown = ({ className = '' }: ShippingCountdownProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col gap-2 p-3 rounded-xl bg-muted/50 border border-border ${className}`}
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
    </motion.div>
  );
};
