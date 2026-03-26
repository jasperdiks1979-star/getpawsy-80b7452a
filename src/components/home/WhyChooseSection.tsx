import Truck from 'lucide-react/dist/esm/icons/truck';
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import Heart from 'lucide-react/dist/esm/icons/heart';
import Headphones from 'lucide-react/dist/esm/icons/headphones';

const REASONS = [
  {
    icon: Truck,
    title: 'Fast US Shipping',
    desc: 'Orders ship within 1–2 business days from US-based fulfillment centers. Standard delivery in 3–7 business days.',
  },
  {
    icon: RotateCcw,
    title: '30-Day Easy Returns',
    desc: 'Not the right fit? Return unused items within 30 days — easy, with clear steps and fast refunds.',
  },
  {
    icon: ShieldCheck,
    title: 'Carefully Selected Products',
    desc: 'Every item is vetted for quality, safety, and pet comfort before it reaches our store.',
  },
  {
    icon: Heart,
    title: 'Built for Pet Owners',
    desc: 'We focus exclusively on dogs and cats — curating products that real pet owners love and trust.',
  },
  {
    icon: Headphones,
    title: 'Responsive Customer Support',
    desc: 'Our team responds within 24–48 hours via email. Real people, real help — no bots.',
  },
] as const;

/**
 * "Why Pet Owners Trust GetPawsy" — 5-block trust section.
 */
export function WhyChooseSection() {
  return (
    <section className="py-12 md:py-16 bg-muted/30">
      <div className="container px-4 md:px-6 max-w-5xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground text-center mb-2">
          Why Pet Owners Trust GetPawsy
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-10 max-w-lg mx-auto">
          How we deliver a reliable shopping experience for US pet owners
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
          {REASONS.map((r) => (
            <div key={r.title} className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <r.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground text-base mb-1">{r.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default WhyChooseSection;
