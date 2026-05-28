import { Sparkles, Heart, Clock, CheckCircle } from 'lucide-react';
import { getConversionFlag } from '@/lib/conversionFlags';

const BENEFITS = [
  { icon: Sparkles, text: 'Keep your home cleaner with less effort' },
  { icon: Heart, text: 'Improve comfort for your pet' },
  { icon: Clock, text: 'Save time on daily cleaning and care' },
  { icon: CheckCircle, text: 'Simple solutions that actually work' },
] as const;

export function BenefitsSection() {
  const v2 = getConversionFlag('premiumHomeAboveFold');
  if (v2) {
    return (
      <section className="py-12 md:py-16 border-y border-border/40" aria-label="Benefits">
        <div className="container px-4 md:px-6 max-w-3xl mx-auto">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground text-center mb-3">
            Why pet owners choose us
          </p>
          <h2 className="text-xl md:text-2xl font-display font-semibold tracking-tight text-foreground text-center mb-8">
            Designed for real pet owners
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 list-none p-0 m-0">
            {BENEFITS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-b-0 sm:nth-last-2:border-b-0">
                <Icon className="w-4 h-4 text-primary flex-shrink-0" strokeWidth={1.75} />
                <span className="text-sm text-foreground">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }
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
