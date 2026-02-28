/**
 * SocialProofBlock — Static testimonial grid for homepage conversion.
 * Zero JS dependencies, pure HTML/CSS for performance.
 */

const testimonials = [
  {
    name: 'Emily R.',
    location: 'Austin, TX',
    text: 'My Maine Coon finally has a tree that doesn\'t wobble. Shipped fast, quality is amazing.',
    pet: '🐱',
  },
  {
    name: 'Jason M.',
    location: 'Denver, CO',
    text: 'Best dog toys we\'ve found online. Our Lab destroys everything — these actually last.',
    pet: '🐶',
  },
  {
    name: 'Sarah K.',
    location: 'Portland, OR',
    text: 'Customer service responded in 2 hours. Returned one item hassle-free. Will buy again.',
    pet: '🐾',
  },
];

export function SocialProofBlock() {
  return (
    <section className="py-14 md:py-16 bg-sand/40">
      <div className="container px-4 md:px-6">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
            Trusted by 2,000+ Pet Parents
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="bg-card rounded-2xl border border-border/40 p-6 shadow-sm"
            >
              <div className="flex items-center gap-1 mb-3 text-amber-400">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} className="text-base">★</span>
                ))}
              </div>
              <p className="text-sm text-foreground leading-relaxed mb-4">
                "{t.text}"
              </p>
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-lg">
                  {t.pet}
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.location}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default SocialProofBlock;
