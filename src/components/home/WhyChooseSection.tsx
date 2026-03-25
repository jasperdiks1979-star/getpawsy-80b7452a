import Truck from 'lucide-react/dist/esm/icons/truck';
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';

const REASONS = [
  {
    icon: Truck,
    title: 'Fast US Shipping',
    desc: 'Orders ship within 1–2 business days with tracking included.',
  },
  {
    icon: RotateCcw,
    title: 'Easy Returns',
    desc: '30-day hassle-free returns on unused items. No questions asked.',
  },
  {
    icon: ShieldCheck,
    title: 'Carefully Selected Products',
    desc: 'Every item is vetted for quality, safety, and pet comfort before listing.',
  },
] as const;

/**
 * "Why Pet Owners Choose GetPawsy" — 3-column trust section.
 */
export function WhyChooseSection() {
  return (
    <section className="py-12 md:py-16">
      <div className="container px-4 md:px-6 max-w-4xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground text-center mb-2">
          Why Pet Owners Choose GetPawsy
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-8 max-w-lg mx-auto">
          ★★★★★ 4.8/5 from happy customers
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
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
