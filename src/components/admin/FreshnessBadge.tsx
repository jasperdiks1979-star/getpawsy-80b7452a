import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { evaluateFreshness, type CadenceSpec } from '@/lib/freshness';

const TONE_CLASS: Record<string, string> = {
  positive: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  neutral: 'bg-muted text-muted-foreground border-border',
  caution: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  danger: 'bg-destructive/10 text-destructive border-destructive/30',
};

const STATE_LABEL: Record<string, string> = {
  fresh: 'LIVE',
  aging: 'AGING',
  stale: 'STALE',
  expired: 'EXPIRED',
  unknown: 'UNKNOWN',
};

/**
 * Cadence-aware freshness badge (Batch F). Render next to any headline number
 * that comes from a scheduled job or cached snapshot.
 */
export function FreshnessBadge({
  lastUpdated,
  cadence,
  className,
  showMessage = true,
}: {
  lastUpdated: string | number | Date | null | undefined;
  cadence: CadenceSpec;
  className?: string;
  showMessage?: boolean;
}) {
  const f = evaluateFreshness(lastUpdated, cadence);
  return (
    <span className={cn('inline-flex items-center gap-2', className)} data-testid="freshness-badge" data-state={f.state}>
      <Badge variant="outline" className={cn('text-[10px] font-semibold tracking-wide', TONE_CLASS[f.tone])}>
        {STATE_LABEL[f.state]}
      </Badge>
      {showMessage && <span className="text-xs text-muted-foreground">{f.message}</span>}
    </span>
  );
}

export default FreshnessBadge;
