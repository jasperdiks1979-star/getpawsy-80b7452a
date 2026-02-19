import { Truck, Shield, HeartHandshake, Clock } from 'lucide-react';
import { FREE_SHIPPING_THRESHOLD, RETURN_WINDOW_DAYS, DELIVERY_TIME_STANDARD } from '@/lib/shipping-constants';

const badges = [
  {
    icon: Truck,
    title: 'Free US Shipping',
    description: `On orders over $${FREE_SHIPPING_THRESHOLD}`,
    color: 'primary',
  },
  {
    icon: Clock,
    title: 'Fast Delivery',
    description: DELIVERY_TIME_STANDARD,
    color: 'sand',
  },
  {
    icon: Shield,
    title: `${RETURN_WINDOW_DAYS}-Day Returns`,
    description: 'Hassle-free returns',
    color: 'success',
  },
  {
    icon: HeartHandshake,
    title: 'Real Support',
    description: 'We respond within 24h',
    color: 'secondary',
  },
];

export const AnimatedTrustBadges = () => {
  return (
    <section
      className="py-6 md:py-10 bg-sand/50 border-y border-border/30"
      aria-label="Trust and shipping information"
    >
      <div className="container px-4 md:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
          {badges.map((badge, i) => {
            const Icon = badge.icon;
            return (
              <div
                key={badge.title}
                className="group flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-card/60 backdrop-blur-sm border border-border/40 hover:border-primary/20 hover:bg-card/80 transition-all duration-300 animate-fadeInUp"
                style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}
              >
                <div
                  className={`flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center ${
                    badge.color === 'primary' ? 'bg-primary/10' :
                    badge.color === 'success' ? 'bg-success/10' :
                    badge.color === 'sand' ? 'bg-sand' :
                    'bg-secondary/60'
                  }`}
                >
                  <Icon className={`w-5 h-5 md:w-6 md:h-6 ${
                    badge.color === 'primary' ? 'text-primary' :
                    badge.color === 'success' ? 'text-success' :
                    badge.color === 'sand' ? 'text-sand-foreground' :
                    'text-secondary-foreground'
                  }`} />
                </div>

                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground text-sm md:text-base leading-tight">
                    {badge.title}
                  </h3>
                  <p className="text-xs md:text-sm text-muted-foreground leading-tight mt-0.5">
                    {badge.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default AnimatedTrustBadges;
