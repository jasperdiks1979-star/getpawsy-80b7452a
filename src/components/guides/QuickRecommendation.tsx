import { Link } from 'react-router-dom';
import { Award, DollarSign, Crown, ArrowRight } from 'lucide-react';
import { OptimizedImage } from '@/components/ui/optimized-image';
import type { QuickRecommendation as QRType } from '@/types/guide';

interface Props {
  data: QRType;
}

const picks = [
  { key: 'bestOverall' as const, label: 'Best Overall', icon: Award, accentColor: 'text-primary', badgeBg: 'bg-primary/10 ring-primary/20', numberBg: 'bg-primary' },
  { key: 'bestBudget' as const, label: 'Best Budget', icon: DollarSign, accentColor: 'text-green-600', badgeBg: 'bg-green-500/10 ring-green-500/20', numberBg: 'bg-green-600' },
  { key: 'bestPremium' as const, label: 'Best Premium', icon: Crown, accentColor: 'text-amber-600', badgeBg: 'bg-amber-500/10 ring-amber-500/20', numberBg: 'bg-amber-600' },
] as const;

export function QuickRecommendation({ data }: Props) {
  return (
    <div className="relative mb-12">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-sm">
          <Award className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-display font-bold text-foreground tracking-tight">
            Quick Recommendations
          </h2>
          <p className="text-xs text-muted-foreground">Expert-tested & vetted picks</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {picks.map(({ key, label, icon: Icon, accentColor, badgeBg, numberBg }, index) => {
          const pick = data[key];
          return (
            <Link
              key={key}
              to={pick.link}
              className="group relative bg-card rounded-2xl border border-border overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/30"
            >
              {/* Product image */}
              <div className="relative w-full aspect-[4/3] bg-muted overflow-hidden">
                {pick.image ? (
                  <OptimizedImage
                    src={pick.image}
                    alt={pick.name}
                    aspectRatio="auto"
                    containerClassName="w-full h-full"
                    className="group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/60">
                    <Icon className={`w-12 h-12 ${accentColor} opacity-30`} />
                  </div>
                )}
                {/* Ranking number overlay */}
                <div className={`absolute top-3 left-3 w-7 h-7 ${numberBg} rounded-full flex items-center justify-center shadow-md`}>
                  <span className="text-white text-xs font-bold">{index + 1}</span>
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                {/* Badge */}
                <span className={`inline-flex items-center gap-1.5 ${badgeBg} ring-1 text-xs font-bold px-2.5 py-1 rounded-full mb-3 ${accentColor}`}>
                  <Icon className="w-3 h-3" />
                  {label}
                </span>

                <h3 className="font-display font-bold text-foreground group-hover:text-primary transition-colors text-[15px] leading-snug mb-2">
                  {pick.name}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-3">
                  {pick.reason}
                </p>

                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:gap-2.5 transition-all duration-300">
                  View Pick <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
