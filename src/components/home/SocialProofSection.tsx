import { ShieldCheck, Truck, RotateCcw, Mail } from 'lucide-react';
import {
  FREE_SHIPPING_THRESHOLD,
  RETURN_WINDOW_DAYS,
  DELIVERY_TIME_STANDARD,
  SUPPORT_EMAIL,
} from '@/lib/shipping-constants';
import { getConversionFlag } from '@/lib/conversionFlags';

/**
 * Customer Promise — replaces unsubstantiated "thousands of pet owners" claim.
 * Google Merchant Center Misrepresentation policy requires that all claims
 * are verifiable. We show only factual, policy-backed promises.
 */
export function SocialProofSection() {
  const premium = getConversionFlag('premiumSocialProof');
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
    <section
      className={premium
        ? 'py-12 md:py-16 border-t border-border/40'
        : 'py-10 md:py-14 bg-muted/30 border-t border-border/30'}
      aria-label="Our customer promise"
    >
      <div className="container px-4 md:px-6 max-w-5xl mx-auto">
        <div className="text-center mb-8">
          {premium && (
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
              Customer promise
            </p>
          )}
          <h2 className={premium
            ? 'font-display text-2xl md:text-3xl font-semibold tracking-tight text-foreground mb-2'
            : 'text-xl md:text-2xl font-display font-bold text-foreground mb-2'}>
            Our Customer Promise
          </h2>
          <p className={premium
            ? 'text-[14px] text-muted-foreground/90 max-w-xl mx-auto leading-relaxed'
            : 'text-sm text-muted-foreground max-w-xl mx-auto'}>
            Every order from GetPawsy LLC is backed by clear, written policies. No fine print, no surprises.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {promises.map(({ icon: Icon, title, detail }) => (
            <div
              key={title}
              className={premium
                ? 'flex flex-col items-center text-center p-5 rounded-2xl border border-border/50'
                : 'flex flex-col items-center text-center p-4 rounded-xl bg-background border border-border/50'}
            >
              <div className={premium
                ? 'w-10 h-10 rounded-full border border-border/60 flex items-center justify-center mb-3'
                : 'w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-3'}>
                <Icon className={premium ? 'w-4 h-4 text-foreground/70' : 'w-5 h-5 text-primary'} strokeWidth={premium ? 1.5 : 2} />
              </div>
              <p className={premium ? 'font-display font-semibold text-[14px] text-foreground tracking-tight mb-1' : 'font-semibold text-sm text-foreground mb-1'}>{title}</p>
              <p className={premium ? 'text-[12px] text-muted-foreground/85 leading-snug' : 'text-xs text-muted-foreground leading-snug'}>{detail}</p>
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
