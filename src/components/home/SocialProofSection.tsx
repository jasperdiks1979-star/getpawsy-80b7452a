import { Star } from 'lucide-react';

export function SocialProofSection() {
  return (
    <section className="py-10 md:py-14 bg-muted/30 border-t border-border/30" aria-label="Social proof">
      <div className="container px-4 md:px-6 max-w-3xl mx-auto text-center">
        <div className="flex justify-center gap-1 mb-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} className="w-6 h-6 text-yellow-400 fill-yellow-400" />
          ))}
        </div>
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-3">
          Loved by Pet Owners
        </h2>
        <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-xl mx-auto">
          Thousands of pet owners are upgrading their daily routine with simple, effective solutions
          that make life easier for both them and their pets.
        </p>
      </div>
    </section>
  );
}

export default SocialProofSection;
