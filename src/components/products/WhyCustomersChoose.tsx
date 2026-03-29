import { Shield, Truck, RotateCcw, Award, CheckCircle } from 'lucide-react';

/**
 * "Why Customers Choose GetPawsy" trust section for product pages.
 * Static HTML — visible to crawlers, no JS dependency.
 */
export function WhyCustomersChoose() {
  const reasons = [
    { icon: Truck, title: 'US Shipping', desc: 'Orders ship within 1–2 business days. Free on orders $35+.' },
    { icon: Shield, title: 'Secure Checkout', desc: '256-bit SSL encryption protects every transaction.' },
    { icon: RotateCcw, title: '30-Day Returns', desc: 'Not satisfied? Return unused items within 30 days to arrange a return.' },
    { icon: Award, title: 'Quality Tested', desc: 'Every product is vetted for durability, safety, and pet comfort.' },
  ];

  return (
    <section className="mt-12 rounded-xl border border-border/40 bg-muted/20 p-6 md:p-8">
      <h2 className="text-lg md:text-xl font-display font-bold text-foreground mb-5 text-center">
        Why Customers Choose GetPawsy
      </h2>
      <div className="grid sm:grid-cols-2 gap-4">
        {reasons.map((r) => (
          <div key={r.title} className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <r.icon className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{r.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{r.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
