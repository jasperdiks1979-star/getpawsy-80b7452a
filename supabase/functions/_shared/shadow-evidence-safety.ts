// Pure safety guards for bounded PostgREST reads and resumable classification windows.
// These functions do not access the database and can be regression-tested offline.
export function assertCompleteEvidence(actualRows: number, exactCount: number | null, label: string): void {
  if (exactCount === null || !Number.isSafeInteger(exactCount) || exactCount < 0 || actualRows !== exactCount) {
    throw new Error(`${label} evidence incomplete; reduce batch or paginate`);
  }
}

export interface ShadowCheckpoint {
  hours?: number;
  since?: string;
  cursor?: string;
  version?: string;
}
export function resolveShadowWindow(
  checkpoint: ShadowCheckpoint | null,
  hours: number,
  started: number,
  version?: string,
): { sinceIso: string; cursor: string } {
  const cp = checkpoint ?? {};
  const parsed = Date.parse(cp.since ?? "");
  const canResume = cp.hours === hours && (!version || cp.version === version) && !!cp.cursor && !!cp.since &&
    Number.isFinite(parsed) && parsed <= started &&
    parsed >= started - 8 * 24 * 3600 * 1000;
  return canResume
    ? { sinceIso: cp.since!, cursor: cp.cursor! }
    : { sinceIso: new Date(started - hours * 3600 * 1000).toISOString(), cursor: "" };
}
