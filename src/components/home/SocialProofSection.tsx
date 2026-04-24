import { ShieldCheck, Truck, RotateCcw, Mail } from 'lucide-react';
import {
  FREE_SHIPPING_THRESHOLD,
  RETURN_WINDOW_DAYS,
  DELIVERY_TIME_STANDARD,
  SUPPORT_EMAIL,
} from '@/lib/shipping-constants';

/**
 * Customer Promise — replaces unsubstantiated "thousands of pet owners" claim.
 * Google Merchant Center Misrepresentation policy requires that all claims
 * are verifiable. We show only factual, policy-backed promises.
 */
export function SocialProofSection() {
  const promises = [
    {
      icon: Truck,
      title: 'Free US Shipping',
      detail: `On orders over $${FREE_SHIPPING_THRESHOLD} · ${DELIVERY_TIME_STANDARD}`,
    },
    {
      icon: RotateCcw,
      title: `${RETURN_WINDOW_DAYS}-Day Returns`,
      detail: 'Hassle-free return process on eligible items',
    },
    {
      icon: ShieldCheck,
      title: 'Secure Checkout',
      detail: 'SSL-encrypted payments via Stripe & PayPal',
    },
    {
      icon: Mail,
      title: 'Real Support',
      detail: 'Email replies within 24 hours from a real person',
    },
  ];

  return (
    <section className="py-10 md:py-14 bg-muted/30 border-t border-border/30" aria-label="Our customer promise">
      <div className="container px-4 md:px-6 max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-2">
            Our Customer Promise
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Every order from GetPawsy LLC is backed by clear, written policies. No fine print, no surprises.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {promises.map(({ icon: Icon, title, detail }) => (
            <div
              key={title}
              className="flex flex-col items-center text-center p-4 rounded-xl bg-background border border-border/50"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <p className="font-semibold text-sm text-foreground mb-1">{title}</p>
              <p className="text-xs text-muted-foreground leading-snug">{detail}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground/70 text-center mt-6">
          Questions? Email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
            {SUPPORT_EMAIL}
          </a>{' '}
          — we reply Monday–Friday, 9 AM – 5 PM ET.
        </p>
      </div>
    </section>
  );
}

export default SocialProofSection;
