import { Link } from 'react-router-dom';
import { Award, DollarSign, Crown, ArrowRight } from 'lucide-react';
import type { QuickRecommendation as QRType } from '@/types/guide';

interface Props {
  data: QRType;
}

const picks = [
  { key: 'bestOverall' as const, label: 'Best Overall', icon: Award, gradient: 'from-primary/15 to-primary/5', iconColor: 'text-primary', borderAccent: 'group-hover:border-primary/40' },
  { key: 'bestBudget' as const, label: 'Best Budget', icon: DollarSign, gradient: 'from-green-500/10 to-green-500/5', iconColor: 'text-green-600', borderAccent: 'group-hover:border-green-500/40' },
  { key: 'bestPremium' as const, label: 'Best Premium', icon: Crown, gradient: 'from-amber-500/10 to-amber-500/5', iconColor: 'text-amber-600', borderAccent: 'group-hover:border-amber-500/40' },
] as const;

export function QuickRecommendation({ data }: Props) {
  return (
    <div className="relative mb-12 rounded-2xl overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-card to-amber-500/[0.03]" />
      <div className="absolute inset-0 border border-primary/10 rounded-2xl" />
      
      <div className="relative p-6 md:p-8">
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
          {picks.map(({ key, label, icon: Icon, gradient, iconColor, borderAccent }) => {
            const pick = data[key];
            return (
              <Link
                key={key}
                to={pick.link}
                className={`group relative bg-card rounded-xl border border-border p-5 transition-all duration-300 hover:shadow-soft hover:-translate-y-0.5 ${borderAccent}`}
              >
                {/* Top gradient accent line */}
                <div className={`absolute top-0 left-4 right-4 h-[2px] bg-gradient-to-r ${gradient} rounded-full opacity-60`} />
                
                <div className="flex items-center gap-2.5 mb-3">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${iconColor}`} />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {label}
                  </span>
                </div>

                <h3 className="font-display font-bold text-foreground group-hover:text-primary transition-colors text-base leading-snug mb-2">
                  {pick.name}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">{pick.reason}</p>
                
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  View Pick <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
