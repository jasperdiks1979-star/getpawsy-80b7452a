import { evaluateCacheFreshness, formatCacheAge } from "@/lib/analyticsCacheFreshness";

export interface CacheFreshnessSource {
  cache_generated_at?: string | null;
  cache_status?: string;
  cache_refresh_failing?: boolean;
  last_refresh_attempt_at?: string | null;
  served_from_client_cache?: boolean;
  generated_at?: string | null;
}

export type FreshnessDisplay = "FRESH" | "STALE" | "FALLBACK" | "NOT CURRENT" | "MISSING";

/**
 * Client-side verdict. Always recomputed from `cache_generated_at` against the
 * browser clock so a payload held in React-Query / localStorage can never be
 * presented as fresher than it is.
 */
export function freshnessDisplay(truth: CacheFreshnessSource | null | undefined, hours: number, now = Date.now()) {
  const generatedAt = truth?.cache_generated_at ?? truth?.generated_at ?? null;
  const v = evaluateCacheFreshness({ hours, generatedAt, now, lastRefreshAttemptAt: truth?.last_refresh_attempt_at ?? null });
  let display: FreshnessDisplay;
  if (v.state === "missing") display = "MISSING";
  else if (v.state === "fresh") display = truth?.served_from_client_cache ? "FALLBACK" : "FRESH";
  else if (v.state === "stale") display = truth?.served_from_client_cache || truth?.cache_refresh_failing ? "FALLBACK" : "STALE";
  else display = "NOT CURRENT";
  return { ...v, display, generatedAt };
}

export function CacheFreshnessBadge({ truth, hours, testId = "cache-freshness-badge" }: { truth: CacheFreshnessSource | null | undefined; hours: number; testId?: string }) {
  if (!truth) return null;
  const f = freshnessDisplay(truth, hours);
  const tone = f.display === "FRESH" ? "bg-muted text-muted-foreground" : f.display === "STALE" ? "bg-accent text-accent-foreground" : "bg-destructive/15 text-destructive";
  return (
    <span
      data-testid={testId}
      data-freshness={f.display}
      title={f.label}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold normal-case ${tone}`}
    >
      {f.display}
      <span className="font-normal">
        · {f.generatedAt ? `generated ${new Date(f.generatedAt).toLocaleString()} (${formatCacheAge(f.ageSeconds ?? 0)})` : "no snapshot"}
      </span>
    </span>
  );
}
