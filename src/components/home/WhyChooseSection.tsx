import Truck from 'lucide-react/dist/esm/icons/truck';
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';

const REASONS = [
  {
    icon: Truck,
    title: 'US Shipping',
    desc: 'Free on orders over $35. Delivery in 5–10 business days.',
  },
  {
    icon: RotateCcw,
    title: '30-Day Returns',
    desc: 'Return unused items within 30 days. Easy process.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure Checkout',
    desc: 'Payments via Stripe. Visa, Mastercard, PayPal, Apple Pay accepted.',
  },
] as const;

/**
 * Compact 3-block trust strip — conversion-focused, minimal.
 */
export function WhyChooseSection() {
  return (
    <section className="py-8 md:py-10 bg-muted/30">
      <div className="container px-4 md:px-6 max-w-3xl mx-auto">
        <h2 className="text-lg md:text-xl font-display font-bold text-foreground text-center mb-6">
          Why Customers Choose GetPawsy
        </h2>

        <div className="grid grid-cols-3 gap-4 md:gap-6">
          {REASONS.map((r) => (
            <div key={r.title} className="text-center">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <r.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground text-sm mb-0.5">{r.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default WhyChooseSection;
