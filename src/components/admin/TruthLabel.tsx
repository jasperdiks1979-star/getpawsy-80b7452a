import { Badge } from '@/components/ui/badge';
import { TRUTH_CLASSES, type TruthClass } from '@/lib/truthLabels';
import { cn } from '@/lib/utils';

const TONE_CLASS: Record<string, string> = {
  positive: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  neutral: 'bg-muted text-muted-foreground border-border',
  caution: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  danger: 'bg-destructive/10 text-destructive border-destructive/30',
};

/**
 * Provenance badge for admin surfaces. Always render this next to any headline
 * number so the reader knows whether it is measured, probed, estimated or fake.
 */
export function TruthLabel({
  truth,
  className,
  showDescription = false,
}: {
  truth: TruthClass;
  className?: string;
  showDescription?: boolean;
}) {
  const meta = TRUTH_CLASSES[truth];
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Badge
        variant="outline"
        title={meta.description}
        className={cn('text-[10px] font-semibold tracking-wide', TONE_CLASS[meta.tone])}
      >
        {meta.label}
      </Badge>
      {showDescription && (
        <span className="text-xs text-muted-foreground">{meta.description}</span>
      )}
    </span>
  );
}

export default TruthLabel;
