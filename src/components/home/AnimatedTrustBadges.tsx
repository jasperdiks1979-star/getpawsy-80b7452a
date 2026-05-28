import Truck from 'lucide-react/dist/esm/icons/truck';
import Shield from 'lucide-react/dist/esm/icons/shield';
import HeartHandshake from 'lucide-react/dist/esm/icons/heart-handshake';
import Clock from 'lucide-react/dist/esm/icons/clock';
import { FREE_SHIPPING_THRESHOLD, RETURN_WINDOW_DAYS, DELIVERY_TIME_STANDARD } from '@/lib/shipping-constants';
import { getConversionFlag } from '@/lib/conversionFlags';

const badges = [
  {
    icon: Truck,
    title: 'Free Shipping Available',
    description: `On orders over $${FREE_SHIPPING_THRESHOLD}`,
    color: 'primary',
  },
  {
    icon: Clock,
    title: 'US Delivery',
    description: DELIVERY_TIME_STANDARD,
    color: 'sand',
  },
  {
    icon: Shield,
    title: `${RETURN_WINDOW_DAYS}-Day Returns`,
    description: 'Easy return process',
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
  const premium = getConversionFlag('premiumSocialProof');
  return (
    <section
      className={premium
        ? 'py-6 md:py-8 border-y border-border/40'
        : 'py-6 md:py-10 bg-sand/50 border-y border-border/30'}
      aria-label="Trust and shipping information"
    >
      <div className="container px-4 md:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
          {badges.map((badge, i) => {
            const Icon = badge.icon;
            return (
              <div
                key={badge.title}
                className={premium
                  ? 'flex items-center gap-3 md:gap-4 p-3 md:p-4'
                  : 'group flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-card/60 backdrop-blur-sm border border-border/40 hover:border-primary/20 hover:bg-card/80 transition-all duration-300'}
              >
                <div
                  className={`flex-shrink-0 w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center ${
                    premium ? 'border border-border/60' :
                    badge.color === 'primary' ? 'bg-primary/10' :
                    badge.color === 'success' ? 'bg-success/10' :
                    badge.color === 'sand' ? 'bg-sand' :
                    'bg-secondary/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 md:w-5 md:h-5 ${
                    premium ? 'text-foreground/70' :
                    badge.color === 'primary' ? 'text-primary' :
                    badge.color === 'success' ? 'text-success' :
                    badge.color === 'sand' ? 'text-sand-foreground' :
                    'text-secondary-foreground'
                  }`} strokeWidth={premium ? 1.5 : 2} />
                </div>

                <div className="min-w-0">
                  <h3 className={premium
                    ? 'font-display font-semibold text-foreground text-[13px] md:text-[14px] tracking-tight leading-tight'
                    : 'font-semibold text-foreground text-sm md:text-base leading-tight'}>
                    {badge.title}
                  </h3>
                  <p className={premium
                    ? 'text-[11px] md:text-[12px] text-muted-foreground/85 leading-tight mt-0.5'
                    : 'text-xs md:text-sm text-muted-foreground leading-tight mt-0.5'}>
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
