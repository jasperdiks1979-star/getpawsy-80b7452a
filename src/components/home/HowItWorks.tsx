export function HowItWorks() {
  const STEPS = [
    { step: '1', title: 'Choose Your Product', desc: 'Browse our carefully selected pet essentials' },
    { step: '2', title: 'Order Securely', desc: 'Fast and safe checkout process' },
    { step: '3', title: 'Enjoy the Difference', desc: 'Cleaner home, happier pet' },
  ];

  return (
    <section
      id="how-it-works"
      className="py-10 md:py-14 bg-background border-t border-border/30 scroll-mt-20"
      aria-label="How it works"
    >
      <div className="container px-4 md:px-6 max-w-4xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-8">
          Simple, Fast, Reliable
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {STEPS.map(({ step, title, desc }) => (
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
