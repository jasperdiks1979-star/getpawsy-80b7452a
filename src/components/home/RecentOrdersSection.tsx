import { Package } from 'lucide-react';

const RECENT_ORDERS = [
  { location: 'Texas', product: 'Dog car seat cover', time: '4 days' },
  { location: 'California', product: 'Cat tree', time: '3 days' },
  { location: 'Florida', product: 'No-pull dog harness', time: '5 days' },
  { location: 'New York', product: 'Self-cleaning litter box', time: '4 days' },
  { location: 'Ohio', product: 'Orthopedic dog bed', time: '5 days' },
] as const;

/**
 * Recently Ordered — factual order-style social proof strip.
 */
export function RecentOrdersSection() {
  return (
    <section className="py-6 md:py-8 border-b border-border/40">
      <div className="container px-4 md:px-6">
        <h2 className="text-sm font-semibold text-muted-foreground text-center mb-4 uppercase tracking-wide">
          Recently Ordered
        </h2>

        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
          {RECENT_ORDERS.map((order) => (
            <div
              key={order.product}
              className="flex-shrink-0 flex items-center gap-2.5 bg-muted/40 rounded-full px-4 py-2 border border-border/30"
            >
              <Package className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="text-xs text-foreground font-medium whitespace-nowrap">
                {order.product}
              </span>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {order.location} · {order.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default RecentOrdersSection;
