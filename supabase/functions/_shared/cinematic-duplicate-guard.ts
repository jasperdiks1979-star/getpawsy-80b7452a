/**
 * Duplicate-active-job guard for cinematic ad render queueing.
 *
 * Rules:
 *  - Only jobs already committed to the renderer can block a sibling.
 *    Concretely: status ∈ {"render_queued", "rendering"}.
 *  - `prepared` (and earlier states) NEVER block. cinematic-ad-prepare
 *    intentionally fans out multiple concept rows per product_slug in the
 *    `prepared` state, and each one must be allowed to enter queue-render.
 *  - Sibling jobs that belong to the SAME director_run_id as the current
 *    job do not block each other. Different concepts of one run may render
 *    in parallel.
 *  - Cross-run duplicates ARE blocked: if a different run already has a
 *    job for this product in render_queued/rendering, the new job is a
 *    duplicate.
 *  - Legacy/solo jobs without a director_run_id (NULL) follow the strictest
 *    interpretation: any render_queued/rendering sibling for the same
 *    product blocks them, regardless of the sibling's run id.
 */

export const BLOCKING_STATUSES = ["render_queued", "rendering"] as const;
export type BlockingStatus = typeof BLOCKING_STATUSES[number];

export type DuplicateGuardJob = {
  id: string;
  status: string;
  director_run_id?: string | null;
};

/**
 * Returns the first sibling that should block the current job, or null
 * if none of the candidates qualify.
 */
export function pickBlockingSibling<T extends DuplicateGuardJob>(
  current: { id: string; director_run_id?: string | null },
  candidates: ReadonlyArray<T>,
): T | null {
  for (const c of candidates) {
    if (!c || c.id === current.id) continue;
    if (!isBlockingStatus(c.status)) continue;
    if (sharesRun(current.director_run_id, c.director_run_id)) continue;
    return c;
  }
  return null;
}

export function isBlockingStatus(status: string | null | undefined): status is BlockingStatus {
  return status === "render_queued" || status === "rendering";
}

function sharesRun(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a === b;
}