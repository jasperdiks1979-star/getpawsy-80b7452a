import { Search, ShieldCheck, Smile } from 'lucide-react';

const STEPS = [
  { icon: Search, step: '1', title: 'Choose Your Product', desc: 'Browse our curated selection of pet essentials.' },
  { icon: ShieldCheck, step: '2', title: 'Order Securely', desc: 'Checkout safely with Stripe — your data is protected.' },
  { icon: Smile, step: '3', title: 'Enjoy With Your Pet', desc: 'Delivered to your door with tracking and easy returns.' },
] as const;

export function HowItWorks() {
  return (
    <section className="py-10 md:py-14 bg-background border-t border-border/30" aria-label="How it works">
      <div className="container px-4 md:px-6 max-w-4xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-8">
          How It Works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {STEPS.map(({ icon: Icon, step, title, desc }) => (
            <div key={step} className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                {step}
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

export default HowItWorks;
