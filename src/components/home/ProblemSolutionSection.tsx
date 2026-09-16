import { Link } from 'react-router-dom';

/**
 * Shop by problem — cat-first indoor-home framing.
 *
 * Each row states a problem a cat owner actually recognises and links to the
 * category that holds the products for it. No claims, no numbers, no promises:
 * these are navigation entries, not marketing assertions.
 */
const PROBLEMS = [
  {
    problem: 'Litter tracked across the floor',
    solution: 'Enclosed and top-entry boxes that keep litter inside',
    href: '/products?category=Cat+Litter+Boxes',
  },
  {
    problem: 'The room smells of the litter box',
    solution: 'Covered boxes with odour-locking lids and drawers',
    href: '/products?category=Cat+Litter+Boxes',
  },
  {
    problem: 'Your sofa is the scratching post',
    solution: 'Sisal towers, wall shelves and dedicated scratchers',
    href: '/products?category=Cat+Trees+%26+Condos',
  },
  {
    problem: 'A bored cat at 5am',
    solution: 'Puzzle feeders and solo-play toys for indoor cats',
    href: '/products?category=Cat+Toys',
  },
  {
    problem: 'Food gone in ten seconds, then sick',
    solution: 'Slow feeders, raised bowls and fountains',
    href: '/products?category=Cat+Bowls+%26+Feeders',
  },
  {
    problem: 'Your cat sleeps everywhere except the bed you bought',
    solution: 'Enclosed caves, window perches and calming beds',
    href: '/products?category=Cat+Beds',
  },
];

export function ProblemSolutionSection() {
  return (
    <section className="py-10 md:py-14 bg-background border-t border-border/30" aria-label="Shop by problem">
      <div className="container px-4 md:px-6">
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-2">
          Shop by problem
        </h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-xl">
          Indoor cats create very specific problems at home. Start with the one that is
          annoying you most.
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          {PROBLEMS.map((p) => (
            <Link
              key={p.problem}
              to={p.href}
              className="rounded-2xl border border-border/40 bg-card px-4 py-4 hover:border-primary/50 hover:shadow-md transition-all"
            >
              <span className="block text-sm md:text-base font-semibold text-foreground">
                {p.problem}
              </span>
              <span className="block text-xs md:text-sm text-muted-foreground mt-1">
                {p.solution}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ProblemSolutionSection;
