import { Link } from 'react-router-dom';
import { Award, Shield, Truck, ArrowRight } from 'lucide-react';
import { OptimizedImage } from '@/components/ui/optimized-image';

interface TopPick {
  label: string;
  name: string;
  price: string;
  link: string;
  image?: string;
}

interface Props {
  picks: TopPick[];
}

const BADGE_STYLES = [
  { bg: 'bg-primary/10', text: 'text-primary', ring: 'ring-primary/20' },
  { bg: 'bg-amber-500/10', text: 'text-amber-600', ring: 'ring-amber-500/20' },
  { bg: 'bg-green-500/10', text: 'text-green-600', ring: 'ring-green-500/20' },
];

export function ConversionBadges({ picks }: Props) {
  if (!picks || !Array.isArray(picks)) return null;
  
  // Only show picks with real images, valid product links, prices, and real names
  const validPicks = picks.filter(p =>
    p.name && p.name.length >= 10 && p.price && p.link?.startsWith('/product') && p.image && !p.image.startsWith('/images/guides/')
  );
  if (validPicks.length < 2) return null;

  return (
    <section className="mb-12 scroll-mt-24">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-sm">
          <Award className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-2xl font-display font-bold text-foreground tracking-tight">
          Our Top Picks at a Glance
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        {validPicks.map((pick, i) => {
          const style = BADGE_STYLES[i] || BADGE_STYLES[0];
          return (
            <Link
              key={i}
              to={pick.link}
              className="group relative block rounded-2xl border border-border bg-card overflow-hidden hover:border-primary/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            >
              {/* Product thumbnail */}
              {pick.image && (
                <div className="w-full aspect-[4/3] bg-muted overflow-hidden">
                  <OptimizedImage
                    src={pick.image}
                    alt={pick.name}
                    aspectRatio="auto"
                    containerClassName="w-full h-full"
                    className="group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
              )}

              <div className="p-5 text-center">
                <span className={`inline-flex items-center ${style.bg} ${style.text} text-xs font-bold px-3.5 py-1.5 rounded-full ring-1 ${style.ring} mb-3`}>
                  {pick.label}
                </span>
                <h3 className="font-display font-bold text-foreground text-sm leading-snug group-hover:text-primary transition-colors mb-2">
                  {pick.name}
                </h3>
                <p className="text-xl font-bold text-foreground tracking-tight">{pick.price}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary group-hover:gap-2 transition-all duration-300">
                  Shop Now <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-8 text-xs text-muted-foreground bg-muted/40 rounded-xl py-3 border border-border/60">
        <span className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-primary" />
          <span className="font-medium">Free Shipping Available</span>
        </span>
        <span className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <span className="font-medium">30-Day Returns</span>
        </span>
      </div>
    </section>
  );
}
