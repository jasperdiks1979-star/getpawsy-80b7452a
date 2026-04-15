import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function FinalCtaSection() {
  return (
    <section className="py-12 md:py-16 bg-primary/5 border-t border-primary/10" aria-label="Call to action">
      <div className="container px-4 md:px-6 max-w-2xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-3">
          Upgrade Your Pet&apos;s Daily Comfort
        </h2>
        <p className="text-sm md:text-base text-muted-foreground mb-6 max-w-lg mx-auto">
          Simple changes can make a big difference for both you and your pet.
        </p>
        <Button asChild size="lg" className="rounded-xl px-10 font-bold min-h-[52px] text-base">
          <Link to="/bestsellers">Shop Now</Link>
        </Button>
      </div>
    </section>
  );
}

export default FinalCtaSection;
