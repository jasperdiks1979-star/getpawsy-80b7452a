import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { evaluateCacheFreshness, formatCacheAge } from "@/lib/analyticsCacheFreshness";

const LABEL = { fresh: "CURRENT", stale: "STALE", fallback: "NOT CURRENT", missing: "COMPUTING" } as const;
const TONE = {
  fresh: "bg-primary/10 text-primary border-primary/30",
  stale: "bg-muted text-muted-foreground border-border",
  fallback: "bg-destructive/10 text-destructive border-destructive/30",
  missing: "bg-muted text-muted-foreground border-border",
} as const;

/** Snapshot time + age + fresh/stale/fallback state for an analytics payload. */
export function CacheFreshnessBadge({
  hours,
  generatedAt,
  clientFallback,
  className,
}: {
  hours: number;
  generatedAt: string | null | undefined;
  clientFallback?: boolean;
  className?: string;
}) {
  const v = evaluateCacheFreshness({ hours, generatedAt });
  const state = clientFallback && v.state === "fresh" ? "stale" : v.state;
  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-2 text-xs text-muted-foreground", className)}
      data-testid="cache-freshness-badge"
      data-state={state}
      title={v.label}
    >
      <Badge variant="outline" className={cn("text-[10px] font-semibold tracking-wide", TONE[state])}>
        {LABEL[state]}
      </Badge>
      {generatedAt ? (
        <span>
          Data from {new Date(generatedAt).toLocaleString()} ({formatCacheAge(v.ageSeconds ?? 0)})
          {clientFallback ? " · saved copy" : ""}
        </span>
      ) : (
        <span>No snapshot yet</span>
      )}
    </span>
  );
}

export default CacheFreshnessBadge;
