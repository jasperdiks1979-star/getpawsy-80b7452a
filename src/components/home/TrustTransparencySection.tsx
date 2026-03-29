import { Truck, RotateCcw, Lock, Mail, Building2 } from 'lucide-react';
import {
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
  SUPPORT_EMAIL,
  RESPONSE_TIME,
} from '@/lib/shipping-constants';

const trustPoints = [
  {
    icon: Truck,
    title: 'US Delivery Available',
    lines: [
      'Orders are shipped to customers across the United States.',
      `Typical delivery: ${DELIVERY_TIME_STANDARD}.`,
    ],
  },
  {
    icon: RotateCcw,
    title: `${RETURN_WINDOW_DAYS}-Day Easy Returns`,
    lines: [
      `Not satisfied? Return your order within ${RETURN_WINDOW_DAYS} days.`,
    ],
  },
  {
    icon: Lock,
    title: 'Secure Checkout',
    lines: [
      'Payments processed securely via Stripe.',
      'Supported: Visa, Mastercard, PayPal, Apple Pay.',
    ],
  },
  {
    icon: Mail,
    title: 'Customer Support',
    lines: [
      'Email support within 24 hours.',
      SUPPORT_EMAIL,
    ],
  },
];

const transparencyDetails = [
  { label: 'Business name', value: 'GetPawsy' },
  { label: 'Operator', value: 'Skidzo' },
  { label: 'Location', value: 'Apeldoorn, Netherlands' },
  { label: 'Registration', value: 'KVK 78156955' },
  { label: 'VAT ID', value: 'NL003295015B69' },
  { label: 'Support email', value: SUPPORT_EMAIL },
];

export const TrustTransparencySection = () => (
  <section
    className="py-10 md:py-14 bg-sand/30 border-b border-border/30"
    aria-label="Trust and business transparency"
  >
    <div className="container px-4 md:px-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8 md:mb-10">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
          Trusted Pet Supply Store
        </h2>
        <p className="mt-2 text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">
          Reliable pet essentials with shipping to the United States and customer-first policies.
        </p>
      </div>

      {/* Trust bullets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 mb-10">
        {trustPoints.map(({ icon: Icon, title, lines }) => (
          <div
            key={title}
            className="flex items-start gap-4 p-4 md:p-5 rounded-xl bg-card/70 border border-border/40"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground text-sm md:text-base leading-tight">
                {title}
              </h3>
              {lines.map((l) => (
                <p key={l} className="text-xs md:text-sm text-muted-foreground mt-0.5 leading-snug">
                  {l}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Business Transparency */}
      <div className="rounded-xl bg-card/60 border border-border/40 p-5 md:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <h3 className="font-display font-semibold text-foreground text-base md:text-lg">
            Business Transparency
          </h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          GetPawsy is operated by Skidzo, a registered business.
        </p>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {transparencyDetails.map(({ label, value }) => (
            <div key={label} className="flex gap-2">
              <dt className="text-muted-foreground whitespace-nowrap">{label}:</dt>
              <dd className="text-foreground font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground mt-4">
          Orders are fulfilled by trusted logistics partners to ensure US delivery across the United States.
        </p>
      </div>
    </div>
  </section>
);

export default TrustTransparencySection;
