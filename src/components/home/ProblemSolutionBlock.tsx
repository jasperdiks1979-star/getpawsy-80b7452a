/**
 * ProblemSolutionBlock — 4-block problem-based grid for conversion.
 * SVG-only icons, zero external dependencies.
 */

const PROBLEMS = [
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-primary">
        <path d="M3 7v6h6" /><path d="M3 13a9 9 0 0 1 15.36-6.36" />
        <path d="M21 17v-6h-6" /><path d="M21 11A9 9 0 0 1 5.64 17.36" />
      </svg>
    ),
    bg: 'bg-primary/10',
    title: 'Dog pulls on walks?',
    desc: 'Our no-pull harnesses and training leashes give you control from day one. Vet-recommended gear that builds obedience safely.',
    cta: 'Shop Training Tools',
    href: '/collections/dog-training-accessories',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-primary">
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
      </svg>
    ),
    bg: 'bg-secondary/60',
    title: 'Senior dog joint pain?',
    desc: 'Orthopedic memory foam beds with washable covers support aging joints and improve sleep quality for dogs of all sizes.',
    cta: 'Shop Orthopedic Beds',
    href: '/collections/orthopedic-calming-dog-beds',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-secondary-foreground">
        <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
    bg: 'bg-accent/50',
    title: 'Litter box mess?',
    desc: 'Enclosed litter boxes with tracking lids contain odor and scatter. Easy to clean, designed for multi-cat households.',
    cta: 'Shop Litter Solutions',
    href: '/collections/best-cat-litter-boxes',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-primary">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    bg: 'bg-primary/10',
    title: 'Indoor cat boredom?',
    desc: 'Multi-level cat trees, scratching posts, and interactive toys keep indoor cats engaged, active, and mentally stimulated.',
    cta: 'Shop Interactive Toys',
    href: '/collections/cat-condos',
  },
];

export function ProblemSolutionBlock() {
  return (
    <section className="py-14 md:py-16">
      <div className="container px-4 md:px-6">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
            Solve Real Pet Problems
          </h2>
          <p className="text-muted-foreground text-base mt-2 max-w-xl mx-auto">
            Targeted solutions for the challenges pet owners face every day
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {PROBLEMS.map((p) => (
            <div key={p.title} className="bg-card rounded-2xl border border-border/40 p-7 md:p-8 flex flex-col">
              <div className={`w-12 h-12 rounded-xl ${p.bg} flex items-center justify-center mb-5`}>
                {p.icon}
              </div>
              <h3 className="text-lg font-display font-bold text-foreground mb-2">
                {p.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5 flex-1">
                {p.desc}
              </p>
              <a
                href={p.href}
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
              >
                {p.cta}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ProblemSolutionBlock;
