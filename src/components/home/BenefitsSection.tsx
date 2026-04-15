import { Sparkles, Heart, Clock, CheckCircle } from 'lucide-react';

const BENEFITS = [
  { icon: Sparkles, text: 'Keep your home cleaner with less effort' },
  { icon: Heart, text: 'Improve comfort for your pet' },
  { icon: Clock, text: 'Save time on daily cleaning and care' },
  { icon: CheckCircle, text: 'Simple solutions that actually work' },
] as const;

export function BenefitsSection() {
  return (
    <section className="py-10 md:py-14 bg-muted/20 border-y border-border/30" aria-label="Benefits">
      <div className="container px-4 md:px-6 max-w-3xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-8">
          Designed for Real Pet Owners
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left list-none p-0 m-0">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border/40">
              <Icon className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="text-sm md:text-base text-foreground font-medium">{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default BenefitsSection;
