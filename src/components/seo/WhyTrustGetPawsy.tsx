/**
 * WhyTrustGetPawsy — E-E-A-T authority block for guides and PDPs.
 * Provides trust signals without fake claims.
 */

import { Shield, Award, Users } from 'lucide-react';

interface Props {
  variant?: 'guide' | 'pdp';
  className?: string;
}

const TRUST_POINTS = {
  guide: [
    { icon: Award, label: 'Carefully researched', desc: 'Every recommendation is based on real product testing and common pet owner needs.' },
    { icon: Users, label: 'US customer focus', desc: 'All products ship to the United States. Our support team responds within 24 hours.' },
    { icon: Shield, label: 'Independent reviews', desc: 'Our recommendations are never influenced by affiliate commissions or brand partnerships.' },
  ],
  pdp: [
    { icon: Award, label: 'Quality selected', desc: 'Hand-vetted for materials, durability, and real-world performance.' },
    { icon: Users, label: 'Made for everyday pet care', desc: 'Selected to fit common pet care needs based on product research and owner feedback.' },
    { icon: Shield, label: 'Secure & supported', desc: '30-day returns, secure checkout, and responsive US customer support.' },
  ],
};

export function WhyTrustGetPawsy({ variant = 'guide', className = '' }: Props) {
  const points = TRUST_POINTS[variant];

  return (
    <section className={`rounded-2xl border border-border bg-card p-5 md:p-6 ${className}`}>
      <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-4 flex items-center gap-2">
        <Shield className="w-4 h-4" />
        Why Trust GetPawsy
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {points.map(({ icon: Icon, label, desc }) => (
          <div key={label} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
