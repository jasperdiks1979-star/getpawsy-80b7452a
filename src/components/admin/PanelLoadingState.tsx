import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useLoadingPhase, type LoadingPhase } from "@/hooks/useLoadingPhase";

/**
 * PanelLoadingState — the ONE loading/error surface for admin analytics
 * panels. Enforces the deterministic policy: normal skeleton (0–3s),
 * "Still loading…" (3–8s), retryable warning (8–12s), "cache warming"
 * (12–30s), explicit error (>30s).
 *
 * It never renders a zero value — an unavailable panel says so out loud.
 */
export interface PanelLoadingStateProps {
  isLoading: boolean;
  isError?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Skeleton shown during the first (normal) loading phase. */
  skeleton?: React.ReactNode;
  label?: string;
  testId?: string;
  /** Current attempt number (1-based) of the bounded retry sequence. */
  attempt?: number;
  /** Total attempts allowed before the panel gives up and shows an error. */
  maxAttempts?: number;
}

export function panelPhaseLabel(phase: LoadingPhase, label: string): string {
  switch (phase) {
    case "slow":
      return `Still loading ${label}…`;
    case "warn":
      return `${label} is taking longer than expected.`;
    case "stalled":
      return `Still warming — ${label} is being computed because the analytics cache for this window is cold.`;
    case "timeout":
      return `${label} did not respond in time. This is an error, not zero traffic.`;
    default:
      return `Loading ${label}…`;
  }
}

function attemptSuffix(attempt?: number, maxAttempts?: number): string {
  if (!attempt || !maxAttempts || attempt < 1) return "";
  return ` (attempt ${Math.min(attempt, maxAttempts)} of ${maxAttempts})`;
}

export function PanelLoadingState({
  isLoading,
  isError,
  error,
  onRetry,
  skeleton,
  label = "data",
  testId = "panel-loading-state",
  attempt,
  maxAttempts,
}: PanelLoadingStateProps) {

  const phase = useLoadingPhase(isLoading && !isError);
  const hardError = isError || phase === "timeout";

  if (hardError) {
    return (
      <div
        data-testid={`${testId}-error`}
        data-phase={isError ? "error" : "timeout"}
        className="flex flex-wrap items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/5 p-3 text-xs text-rose-600 dark:text-rose-400"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          {isError
            ? `${label} unavailable after ${maxAttempts ?? "all"} attempts — this is an error, not zero traffic.`
            : panelPhaseLabel("timeout", label)}{" "}
          {(error as Error)?.message ?? ""}
        </span>
        {onRetry && (
          <button
            type="button"
            data-testid={`${testId}-retry`}
            onClick={onRetry}
            className="ml-auto inline-flex items-center gap-1 rounded border border-rose-500/40 px-2 py-0.5 font-semibold"
          >
            <RefreshCw className="h-3 w-3" /> Retry now
          </button>
        )}
      </div>
    );
  }

  if (phase === "warn" || phase === "stalled") {
    return (
      <div
        data-testid={`${testId}-${phase}`}
        data-phase={phase}
        className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400"
      >
        {phase === "stalled" ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0" />
        )}
        <span>
          {panelPhaseLabel(phase, label)}
          {attemptSuffix(attempt, maxAttempts)}
        </span>
        {onRetry && (
          <button
            type="button"
            data-testid={`${testId}-retry`}
            onClick={onRetry}
            className="ml-auto inline-flex items-center gap-1 rounded border border-amber-500/40 px-2 py-0.5 font-semibold"
          >
            <RefreshCw className="h-3 w-3" /> Retry now
          </button>
        )}

      </div>
    );
  }

  return (
    <div data-testid={testId} data-phase={phase} className="space-y-2">
      {skeleton ?? (
        <div className="h-16 animate-pulse rounded-md bg-muted/50" />
      )}
      {phase === "slow" && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {panelPhaseLabel("slow", label)}
        </div>
      )}
    </div>
  );
}
