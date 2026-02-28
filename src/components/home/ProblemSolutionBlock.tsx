/**
 * ProblemSolutionBlock — Two-column pain-point agitation for Dog & Cat Training & Travel.
 * SVG-only icons, zero external dependencies.
 */

export function ProblemSolutionBlock() {
  return (
    <section className="py-14 md:py-16">
      <div className="container px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Dog Training & Travel Block */}
          <div className="bg-card rounded-2xl border border-border/40 p-8 md:p-10">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-primary">
                <path d="M3 7v6h6" /><path d="M3 13a9 9 0 0 1 15.36-6.36" />
                <path d="M21 17v-6h-6" /><path d="M21 11A9 9 0 0 1 5.64 17.36" />
              </svg>
            </div>
            <h3 className="text-xl font-display font-bold text-foreground mb-3">
              Dog pulling on the leash?
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Untrained leash behavior makes walks stressful and unsafe. Our no-pull harnesses,
              training leashes, and behavior tools help you build obedience and confidence — whether
              you're starting puppy training or correcting an adult dog. Vet-recommended gear that works.
            </p>
          </div>

          {/* Cat Training & Travel Block */}
          <div className="bg-card rounded-2xl border border-border/40 p-8 md:p-10">
            <div className="w-12 h-12 rounded-xl bg-secondary/60 flex items-center justify-center mb-5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-secondary-foreground">
                <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <h3 className="text-xl font-display font-bold text-foreground mb-3">
              Cat stressed during travel?
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Vet visits and travel don't have to be traumatic. Our airline-approved carriers,
              calming enrichment toys, and scratching posts help cats feel secure at home and on the go.
              Designed for indoor cats who need stimulation and safe transport solutions.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ProblemSolutionBlock;
