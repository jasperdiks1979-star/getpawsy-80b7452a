/**
 * WhyGetPawsySection — 4 feature blocks replacing the comparison table.
 * SVG-only icons, zero external dependencies, no exaggerated claims.
 */

const FEATURES = [
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-primary">
        <path d="M9 12l2 2 4-4" />
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      </svg>
    ),
    title: 'Carefully Curated Products',
    desc: 'Every product is hand-selected and reviewed before it reaches our store. We focus on quality over quantity.',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-primary">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: 'Quality-Checked Suppliers',
    desc: 'We work with vetted suppliers and verify product standards so you can shop with confidence.',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-primary">
        <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
    title: 'US Delivery',
    desc: 'Estimated delivery: 5–10 business days to the United States. Free shipping on orders over $35.',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-primary">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
    title: 'Customer-First Support',
    desc: 'Real humans respond within 24 hours. 30-day easy returns on every order.',
  },
];

export function WhyGetPawsyComparison() {
  return (
    <section className="py-14 md:py-16 bg-muted/20">
      <div className="container px-4 md:px-6">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
            Why Pet Owners Choose GetPawsy
          </h2>
          <p className="text-muted-foreground text-base mt-2 max-w-xl mx-auto">
            Built for US pet parents who value quality, speed, and trust
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-card rounded-2xl border border-border/40 p-6 text-center hover:border-primary/30 hover:shadow-md transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                {f.icon}
              </div>
              <h3 className="font-display font-semibold text-base text-foreground mb-2">
                {f.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default WhyGetPawsyComparison;
