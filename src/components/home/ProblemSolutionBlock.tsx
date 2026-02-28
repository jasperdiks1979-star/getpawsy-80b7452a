/**
 * ProblemSolutionBlock — Two-column pain-point agitation for homepage conversion.
 * SVG-only icons, zero external dependencies.
 */

export function ProblemSolutionBlock() {
  return (
    <section className="py-14 md:py-16">
      <div className="container px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Dog Block */}
          <div className="bg-card rounded-2xl border border-border/40 p-8 md:p-10">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-primary">
                <circle cx="12" cy="12" r="10"/>
                <path d="M8 15h0M16 15h0M9.5 9h0M14.5 9h0"/>
              </svg>
            </div>
            <h3 className="text-xl font-display font-bold text-foreground mb-3">
              Dog bored at home?
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Boredom leads to chewing, barking, and anxiety. Our enrichment toys and puzzle feeders
              keep dogs mentally stimulated and physically active — even when you're away. Vet-recommended
              for destructive chewers and high-energy breeds.
            </p>
          </div>

          {/* Cat Block */}
          <div className="bg-card rounded-2xl border border-border/40 p-8 md:p-10">
            <div className="w-12 h-12 rounded-xl bg-secondary/60 flex items-center justify-center mb-5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-secondary-foreground">
                <path d="M12 5c-3 0-6 2-6 6 0 3 2 5 6 7 4-2 6-4 6-7 0-4-3-6-6-6Z"/>
                <path d="M8 2l1 3M16 2l-1 3"/>
              </svg>
            </div>
            <h3 className="text-xl font-display font-bold text-foreground mb-3">
              Cat ignores cheap toys?
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Cats are hardwired hunters — flimsy toys don't trigger their instincts. Our curated
              selection features interactive wands, crinkle tunnels, and catnip-infused toys
              designed to ignite natural prey drive and keep indoor cats active.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ProblemSolutionBlock;
