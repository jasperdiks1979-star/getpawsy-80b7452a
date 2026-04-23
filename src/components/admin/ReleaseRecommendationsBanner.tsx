import { AlertOctagon, AlertTriangle, Info, Lightbulb, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  type IssueRecommendation,
  type RecommendationSeverity,
  SEVERITY_LABEL,
} from '@/lib/release/issueRecommendations';

/**
 * Top-of-panel "do this first" banner. Renders the ranked
 * recommendations from `buildRecommendations()` so the admin sees
 * concrete actions (and the highest-severity one visually dominates)
 * before scrolling through every individual issue card.
 */

const SEVERITY_STYLES: Record<RecommendationSeverity, { wrap: string; icon: string; badge: 'destructive' | 'secondary' | 'outline' }> = {
  critical: {
    wrap: 'border-destructive/40 bg-destructive/5',
    icon: 'text-destructive',
    badge: 'destructive',
  },
  high: {
    wrap: 'border-orange-500/40 bg-orange-500/5 dark:bg-orange-500/10',
    icon: 'text-orange-600 dark:text-orange-400',
    badge: 'destructive',
  },
  medium: {
    wrap: 'border-yellow-500/40 bg-yellow-500/5 dark:bg-yellow-500/10',
    icon: 'text-yellow-700 dark:text-yellow-400',
    badge: 'secondary',
  },
  low: {
    wrap: 'border-border bg-muted/40',
    icon: 'text-muted-foreground',
    badge: 'outline',
  },
};

function severityIcon(sev: RecommendationSeverity) {
  const cls = cn('h-4 w-4 shrink-0 mt-0.5', SEVERITY_STYLES[sev].icon);
  switch (sev) {
    case 'critical':
      return <ShieldAlert className={cls} />;
    case 'high':
      return <AlertOctagon className={cls} />;
    case 'medium':
      return <AlertTriangle className={cls} />;
    case 'low':
    default:
      return <Info className={cls} />;
  }
}

export function ReleaseRecommendationsBanner({
  recommendations,
}: {
  recommendations: IssueRecommendation[];
}) {
  if (recommendations.length === 0) return null;

  return (
    <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Lightbulb className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Aanbevolen acties
        </span>
        <span className="text-[11px] text-muted-foreground">
          · auto-gegenereerd op basis van ernst
        </span>
      </div>
      <ol className="space-y-2">
        {recommendations.map((rec, idx) => {
          const styles = SEVERITY_STYLES[rec.severity];
          return (
            <li
              key={rec.key}
              className={cn('rounded-md border p-2.5 text-xs', styles.wrap)}
            >
              <div className="flex items-start gap-2">
                {severityIcon(rec.severity)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      #{idx + 1}
                    </span>
                    <Badge variant={styles.badge} className="text-[10px] uppercase tracking-wide">
                      {SEVERITY_LABEL[rec.severity]}
                    </Badge>
                    <span className="font-semibold text-sm text-foreground">
                      {rec.title}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {rec.affectedIssues} issue{rec.affectedIssues === 1 ? '' : 's'}
                      {rec.affectedProducts
                        ? ` · ${rec.affectedProducts} product${rec.affectedProducts === 1 ? '' : 's'}`
                        : ''}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1">{rec.rationale}</p>
                  <ul className="mt-1.5 space-y-0.5 list-decimal list-inside text-foreground/90">
                    {rec.steps.map((step, i) => (
                      <li key={i} className="text-[11px]">
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}