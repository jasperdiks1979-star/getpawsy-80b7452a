/**
 * lpCtaVisibility — single source of truth for "which uplift elements were
 * visible when the user clicked the CTA?".
 *
 * The /go page tracks visibility milestones via an IntersectionObserver and
 * mirrors the seen set onto `window.__gpGoSeen`. At click time we read that
 * set and stamp the outgoing `lp_cta_click` event with `saw_proof_before_click`
 * and `saw_nudge_before_click` booleans. That mapping must be deterministic,
 * so we extract it here so `LinkInBio.tsx` and the verification test consume
 * the SAME function.
 *
 * Placement keys come from the IntersectionObserver targets list:
 *   - 'uplift_proof' → social-proof line above the primary CTA
 *   - 'uplift_nudge' → directional-nudge block (contains the bouncing arrow)
 */

export type SeenSet = Set<string> | undefined | null;

export type VisibilityFlags = {
  saw_proof_before_click: boolean;
  saw_nudge_before_click: boolean;
};

/**
 * Pure function: given the seen-set at click time, return the boolean flags
 * that should be attached to the lp_cta_click event payload. Safe to call
 * with `undefined` (e.g. observer never fired because the elements were
 * never on screen — both flags then false).
 */
export function visibilityFlagsFromSeen(seen: SeenSet): VisibilityFlags {
  return {
    saw_proof_before_click: seen?.has('uplift_proof') ?? false,
    saw_nudge_before_click: seen?.has('uplift_nudge') ?? false,
  };
}

/** Read the seen set from the window-scoped mirror written by /go's observer. */
export function readGoSeenSet(): SeenSet {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { __gpGoSeen?: Set<string> }).__gpGoSeen;
}

/** Convenience for callers: read window mirror + compute flags in one step. */
export function visibilityFlagsAtClickTime(): VisibilityFlags {
  return visibilityFlagsFromSeen(readGoSeenSet());
}