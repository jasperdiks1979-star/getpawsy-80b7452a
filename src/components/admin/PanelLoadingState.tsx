import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useLoadingPhase, type LoadingPhase } from "@/hooks/useLoadingPhase";

/**
 * PanelLoadingState — the ONE loading/error surface for admin analytics
 * panels. Enforces the deterministic policy: normal skeleton (0–3s),
 * "Still loading…" (3–8s), retryable warning (8–12s), explicit error (>12s).
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
}

export function panelPhaseLabel(phase: LoadingPhase, label: string): string {
  switch (phase) {
    case "slow":
      return `Still loading ${label}…`;
    case "warn":
      return `${label} is taking longer than expected.`;
    case "timeout":
      return `${label} did not respond in time. This is an error, not zero traffic.`;
    default:
      return `Loading ${label}…`;
  }
}

export function PanelLoadingState({
  isLoading,
  isError,
  error,
  onRetry,
  skeleton,
  label = "data",
  testId = "panel-loading-state",
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
            ? `${label} unavailable — this is an error, not zero traffic.`
            : panelPhaseLabel("timeout", label)}{" "}
          {(error as Error)?.message ?? ""}
        </span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-auto inline-flex items-center gap-1 rounded border border-rose-500/40 px-2 py-0.5 font-semibold"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        )}
      </div>
    );
  }

  if (phase === "warn") {
    return (
      <div
        data-testid={`${testId}-warn`}
        data-phase="warn"
        className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{panelPhaseLabel("warn", label)}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-auto inline-flex items-center gap-1 rounded border border-amber-500/40 px-2 py-0.5 font-semibold"
          >
            <RefreshCw className="h-3 w-3" /> Retry
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
