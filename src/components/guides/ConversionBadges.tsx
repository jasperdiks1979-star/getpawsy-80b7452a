import { Link } from 'react-router-dom';
import { Award, Shield, Truck } from 'lucide-react';

interface TopPick {
  label: string;
  name: string;
  price: string;
  link: string;
}

interface Props {
  picks: TopPick[];
}

export function ConversionBadges({ picks }: Props) {
  if (!picks || picks.length === 0) return null;

  return (
    <section className="mb-10 scroll-mt-24">
      <h2 className="text-2xl font-display font-bold text-foreground mb-4 flex items-center gap-2">
        <Award className="w-5 h-5 text-primary" />
        Our Top Picks at a Glance
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {picks.map((pick, i) => (
          <Link
            key={i}
            to={pick.link}
            className="group block rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all text-center"
          >
            <span className="inline-block bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full mb-2">
              {pick.label}
            </span>
            <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors mb-1">
              {pick.name}
            </h3>
            <p className="text-lg font-bold text-foreground">{pick.price}</p>
          </Link>
        ))}
      </div>
      <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground bg-muted/30 rounded-lg py-2.5 border border-border">
        <span className="flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5 text-primary" />
          Free US Shipping
        </span>
        <span className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-primary" />
          30-Day Returns
        </span>
      </div>
    </section>
  );
}
