import { Link } from 'react-router-dom';
import { Award, DollarSign, Crown } from 'lucide-react';
import type { QuickRecommendation as QRType } from '@/types/guide';

interface Props {
  data: QRType;
}

const picks = [
  { key: 'bestOverall' as const, label: 'Best Overall', icon: Award, accent: 'text-primary' },
  { key: 'bestBudget' as const, label: 'Best Budget', icon: DollarSign, accent: 'text-green-600' },
  { key: 'bestPremium' as const, label: 'Best Premium', icon: Crown, accent: 'text-amber-600' },
] as const;

export function QuickRecommendation({ data }: Props) {
  return (
    <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 mb-10">
      <h2 className="text-lg font-display font-bold text-foreground mb-4">
        ⚡ Quick Recommendations
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {picks.map(({ key, label, icon: Icon, accent }) => {
          const pick = data[key];
          return (
            <Link
              key={key}
              to={pick.link}
              className="group bg-background rounded-lg border border-border p-4 hover:border-primary/40 transition-all hover:shadow-sm"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${accent}`} />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </span>
              </div>
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors text-sm mb-1">
                {pick.name}
              </h3>
              <p className="text-xs text-muted-foreground">{pick.reason}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
