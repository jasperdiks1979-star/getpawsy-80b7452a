// useLoadingPhase — deterministic loading escalation for admin analytics panels.
//
// Panels must never spin forever. While a query is loading this hook walks
// through explicit phases so the UI can tell the operator what is happening:
//
//   0–3s     "loading"  — normal skeleton
//   3–8s     "slow"     — "Still loading…"
//   8–12s    "warn"     — retryable warning
//   12–30s   "stalled"  — cache is cold / warming, retry offered
//   >30s     "timeout"  — explicit error + retry
//
// The 12s→30s "stalled" band exists because a cold `analytics-canonical`
// window legitimately takes 15–25s before the warmer cache fills; calling
// that an error was wrong and pushed operators into pointless retries.
//
// Purely presentational: it never cancels or mutates the underlying query and
// never changes a metric definition.
import { useEffect, useRef, useState } from "react";

export type LoadingPhase = "idle" | "loading" | "slow" | "warn" | "stalled" | "timeout";

export const LOADING_PHASE_THRESHOLDS_MS = {
  slow: 3_000,
  warn: 8_000,
  stalled: 12_000,
  timeout: 30_000,
} as const;

export function useLoadingPhase(isLoading: boolean): LoadingPhase {
  const [phase, setPhase] = useState<LoadingPhase>(isLoading ? "loading" : "idle");
  const timers = useRef<number[]>([]);

  useEffect(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];

    if (!isLoading) {
      setPhase("idle");
      return;
    }

    setPhase("loading");
    timers.current.push(
      window.setTimeout(() => setPhase("slow"), LOADING_PHASE_THRESHOLDS_MS.slow),
      window.setTimeout(() => setPhase("warn"), LOADING_PHASE_THRESHOLDS_MS.warn),
      window.setTimeout(() => setPhase("stalled"), LOADING_PHASE_THRESHOLDS_MS.stalled),
      window.setTimeout(() => setPhase("timeout"), LOADING_PHASE_THRESHOLDS_MS.timeout),
    );

    return () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
    };
  }, [isLoading]);

  return phase;
}
