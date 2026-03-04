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
 *   "Processing Time", "business days", "Delivery Time",
 *   "United States", "US warehouse"
 *
 * Place on: product pages, /shipping, checkout sidebar.
 *
 * IMPORTANT: Also includes a <noscript> fallback so crawlers
 * that don't execute JS can still find the keywords.
 */
export const ShippingTransparency = ({
  className = '',
  variant = 'card',
}: ShippingTransparencyProps) => {
  const noscriptBlock = (
    <noscript>
      <div style={{ padding: '16px', fontSize: '14px', color: '#555' }}>
        <p>Processing Time: 1–2 business days</p>
        <p>Delivery Time: 3–7 business days within the United States</p>
        <p>Fulfillment: Orders ship from US warehouse partners</p>
      </div>
    </noscript>
  );

  if (variant === 'inline') {
    return (
      <>
        <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground ${className}`}>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-primary" />
            Processing Time: 1–2 business days
          </span>
          <span className="flex items-center gap-1">
            <Truck className="w-3 h-3 text-primary" />
            Delivery Time: 3–7 business days within the United States
          </span>
          <span className="flex items-center gap-1">
            <Package className="w-3 h-3 text-primary" />
            Ships from US warehouse partners
          </span>
        </div>
        {noscriptBlock}
      </>
    );
  }

  return (
    <>
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
            <strong>Delivery Time:</strong> 3–7 business days within the United States
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Package className="w-4 h-4 text-primary flex-shrink-0" />
          <span>
            <strong>Fulfillment:</strong> Orders ship from US warehouse partners
          </span>
        </div>
      </div>
      {noscriptBlock}
    </>
  );
};

export default ShippingTransparency;
