import { Sparkles, Heart, Clock } from 'lucide-react';

const BENEFITS = [
  {
    icon: Sparkles,
    title: 'Less Mess in Your Home',
    desc: 'Self-cleaning litter boxes, splash-proof water fountains, and fur-resistant beds — designed to keep your space tidy.',
  },
  {
    icon: Heart,
    title: 'More Comfort for Your Pet',
    desc: 'Every product is chosen for safety, durability, and your pet's everyday comfort.',
  },
  {
    icon: Clock,
    title: 'Save Time on Daily Care',
    desc: 'Practical solutions that simplify feeding, grooming, and cleanup — so you spend less time on chores and more time with your pet.',
  },
] as const;

export function BenefitsSection() {
  return (
    <section className="py-10 md:py-14 bg-muted/20 border-y border-border/30" aria-label="Benefits">
      <div className="container px-4 md:px-6 max-w-4xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-8">
          Why Pet Owners Love GetPawsy
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {BENEFITS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex flex-col items-center gap-3 p-5 rounded-xl bg-card border border-border/40">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground text-base">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default BenefitsSection;
