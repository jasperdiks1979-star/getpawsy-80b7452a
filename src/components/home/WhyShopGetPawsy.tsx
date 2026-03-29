import { Truck, RotateCcw, ShieldCheck, Mail } from 'lucide-react';
import {
  FREE_SHIPPING_THRESHOLD,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';

const pillars = [
  {
    icon: Truck,
    title: 'US Delivery',
    description: `Free shipping on orders over $${FREE_SHIPPING_THRESHOLD}. Estimated delivery: 3–7 business days to the United States.`,
  },
  {
    icon: RotateCcw,
    title: 'Easy Returns',
    description: `${RETURN_WINDOW_DAYS}-day return policy. Items must be unused and in original condition. Contact us to start a return.`,
  },
  {
    icon: ShieldCheck,
    title: 'Secure Checkout',
    description: 'All payments processed securely via Stripe with 256-bit SSL encryption. We accept Visa, Mastercard, PayPal & Apple Pay.',
  },
  {
    icon: Mail,
    title: 'Dedicated Support',
    description: 'Real people respond within 24 hours. Customer support available 7 days a week. Email us anytime at support@getpawsy.pet.',
  },
];

const WhyShopGetPawsy = () => {
  return (
    <section className="py-16 md:py-20 bg-muted/30" aria-label="Why shop with GetPawsy">
      <div className="container px-4 md:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-3">
            Why Shop With GetPawsy
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            We make pet shopping simple, safe, and reliable for US pet parents.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {pillars.map((pillar) => (
            <div
              key={pillar.title}
              className="bg-card rounded-2xl shadow-card p-6 text-center"
            >
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <pillar.icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-display font-semibold text-foreground text-lg mb-2">
                {pillar.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {pillar.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyShopGetPawsy;
