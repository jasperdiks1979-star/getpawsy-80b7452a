import { ShieldCheck, Heart, Truck, RotateCcw, Headphones, Star } from 'lucide-react';

const VALUE_POINTS = [
  {
    icon: Heart,
    title: 'Comfort Your Pet Will Love',
    desc: 'Every product is selected for comfort, safety, and everyday use — so your pet enjoys it and you feel confident buying it.',
  },
  {
    icon: ShieldCheck,
    title: 'Quality You Can Trust',
    desc: 'We test and vet each product before adding it to our store. No generic listings — only items we stand behind.',
  },
  {
    icon: Truck,
    title: 'Fast & Reliable US Shipping',
    desc: 'Free shipping on orders over $35. Every order includes tracking and is delivered within 5–10 business days.',
  },
  {
    icon: RotateCcw,
    title: '30-Day Easy Returns',
    desc: 'Not the right fit? Return eligible items within 30 days. No hassle, no runaround.',
  },
  {
    icon: Headphones,
    title: 'Real Customer Support',
    desc: 'Email us anytime — a real person responds within 24 hours. We handle every question personally.',
  },
  {
    icon: Star,
    title: 'Built for Pet Owners',
    desc: "We're pet owners too. Every product solves a real problem — cleaner homes, happier pets, easier routines.",
  },
] as const;

/**
 * ValueProposition — Why Choose GetPawsy section.
 * Builds trust and differentiates from generic dropshipping stores.
 */
export function ValueProposition() {
  return (
    <section className="py-10 md:py-14 bg-muted/20 border-y border-border/30" aria-label="Why choose GetPawsy">
      <div className="container px-4 md:px-6 max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
            Why Pet Owners Choose GetPawsy
          </h2>
          <p className="mt-2 text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">
            We're not just another pet store. Every product, policy, and interaction is designed around what pet owners actually need.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {VALUE_POINTS.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="flex items-start gap-4 p-4 md:p-5 rounded-xl bg-card border border-border/40 hover:shadow-sm transition-shadow"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-foreground text-sm md:text-base leading-tight">
                  {title}
                </h3>
                <p className="text-xs md:text-sm text-muted-foreground mt-1 leading-relaxed">
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ValueProposition;
