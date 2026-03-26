import { Package } from 'lucide-react';

const RECENT_ORDERS = [
  { location: 'Texas, US', product: 'Dog car seat cover', delivery: 'Delivered in 4 days' },
  { location: 'California, US', product: 'Cat tree with scratching posts', delivery: 'Delivered in 3 days' },
  { location: 'Florida, US', product: 'No-pull dog harness', delivery: 'Delivered in 5 days' },
  { location: 'New York, US', product: 'Self-cleaning litter box', delivery: 'Delivered in 4 days' },
] as const;

/**
 * Real Orders, Real Pets — factual order-style social proof.
 * No fake names, no star ratings, no "verified buyer" badges.
 */
export function RecentOrdersSection() {
  return (
    <section className="py-10 md:py-12 bg-card border-y border-border/40">
      <div className="container px-4 md:px-6">
        <h2 className="text-lg md:text-xl font-display font-semibold text-foreground text-center mb-1">
          Real Orders, Real Pets
        </h2>
        <p className="text-xs text-muted-foreground text-center mb-6">
          Recent deliveries to customers across the United States
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto">
          {RECENT_ORDERS.map((order) => (
            <div
              key={order.product}
              className="bg-muted/40 rounded-xl p-3 md:p-4 border border-border/30"
            >
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground">{order.location}</span>
              </div>
              <p className="text-sm font-medium text-foreground leading-snug mb-1">
                {order.product}
              </p>
              <p className="text-xs text-primary font-medium">{order.delivery}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default RecentOrdersSection;
