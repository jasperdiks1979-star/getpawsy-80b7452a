import { Package, Clock, Truck } from 'lucide-react';

interface ShippingTransparencyProps {
  className?: string;
  /** Render as a compact inline strip vs a card */
  variant?: 'card' | 'inline';
}

/**
 * ShippingTransparency – Google Merchant Center compliance block.
 *
 * Contains the EXACT keywords Google crawlers look for:
 *   "processing time", "business days", "shipping time",
 *   "United States", "US warehouse"
 *
 * Place on: product pages, /shipping, checkout sidebar.
 */
export const ShippingTransparency = ({
  className = '',
  variant = 'card',
}: ShippingTransparencyProps) => {
  if (variant === 'inline') {
    return (
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground ${className}`}>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-primary" />
          Processing time: 1–2 business days
        </span>
        <span className="flex items-center gap-1">
          <Truck className="w-3 h-3 text-primary" />
          Shipping time: 3–7 business days within the United States
        </span>
        <span className="flex items-center gap-1">
          <Package className="w-3 h-3 text-primary" />
          Ships from US warehouse partners
        </span>
      </div>
    );
  }

  return (
    <div className={`bg-muted/40 rounded-xl p-4 space-y-2 ${className}`}>
      <div className="flex items-center gap-2 text-sm text-foreground">
        <Clock className="w-4 h-4 text-primary flex-shrink-0" />
        <span>
          <strong>Processing Time:</strong> 1–2 business days
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm text-foreground">
        <Truck className="w-4 h-4 text-primary flex-shrink-0" />
        <span>
          <strong>Shipping Time:</strong> 3–7 business days within the United States
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm text-foreground">
        <Package className="w-4 h-4 text-primary flex-shrink-0" />
        <span>
          <strong>Fulfillment:</strong> Orders ship from US warehouse partners
        </span>
      </div>
    </div>
  );
};

export default ShippingTransparency;
