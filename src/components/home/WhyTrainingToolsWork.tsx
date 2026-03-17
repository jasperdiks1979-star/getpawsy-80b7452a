/**
 * "Why Our Training Tools Work" — authority block for homepage.
 * Concise, trust-building, no exaggerated claims.
 */
import { Link } from 'react-router-dom';

const PILLARS = [
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
    title: 'Positive Reinforcement Focus',
    desc: 'Every tool supports force-free, vet-approved training methods. No prong collars, no choke chains — just effective solutions that build trust between you and your dog.',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: 'Selected for Durability',
    desc: 'We evaluate durability, fit, and effectiveness across a range of breed sizes. Products that don\'t hold up don\'t make our store.',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
    title: 'Delivery to the US',
    desc: 'Training tools shipped to you. Estimated delivery: 3–7 business days. Free shipping on orders $35+.',
  },
];

const TRAINING_LINKS = [
  { href: '/collections/dog-potty-training', label: 'Potty Training' },
  { href: '/collections/dog-leash-control', label: 'Leash & Control' },
  { href: '/collections/puppy-training-essentials', label: 'Puppy Essentials' },
];

export function WhyTrainingToolsWork() {
  return (
    <section className="py-14 md:py-16">
      <div className="container px-4 md:px-6">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
            Why Our Training Tools Work
          </h2>
          <p className="text-muted-foreground text-base mt-2 max-w-xl mx-auto">
            Quality tools selected for effective, force-free training methods
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto mb-8">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="bg-card rounded-2xl border border-border/40 p-6 text-center hover:border-primary/30 hover:shadow-md transition-all duration-300"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4 text-primary">
                {p.icon}
              </div>
              <h3 className="font-display font-semibold text-base text-foreground mb-2">
                {p.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {p.desc}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {TRAINING_LINKS.map((l) => (
            <Link
              key={l.href}
              to={l.href}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-medium border border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {l.label} →
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default WhyTrainingToolsWork;
