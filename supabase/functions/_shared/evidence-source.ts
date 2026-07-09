/**
 * Evidence Source Taxonomy + Council Gate — Phase 1 (soft).
 *
 * Pure-TypeScript module (no Deno APIs, no fetch, no imports) so it can
 * be shared by:
 *   - the Deno edge emitter (xai-decision.ts)
 *   - the Deno edge Council (aec-executive-council/index.ts)
 *   - Vitest unit tests in the frontend workspace
 *
 * Rules (mem://architecture/organic-first-intelligence):
 *   organic           may drive promotion  (weight 1.00)
 *   blended           allowed, labelled     (weight 0.75)
 *   heuristic         not proof of quality  (weight 0.35)
 *   paid              validation-only       (weight 0.25)
 *   insufficient_data must NEVER promote    (weight 0.05)
 */

export type XaiEvidenceSource =
  | "organic"
  | "paid"
  | "blended"
  | "heuristic"
  | "insufficient_data";

export const XAI_EVIDENCE_SOURCES: readonly XaiEvidenceSource[] = [
  "organic",
  "paid",
  "blended",
  "heuristic",
  "insufficient_data",
] as const;

export const EVIDENCE_SOURCE_WEIGHT: Record<XaiEvidenceSource, number> = {
  organic: 1.0,
  blended: 0.75,
  paid: 0.25,
  heuristic: 0.35,
  insufficient_data: 0.05,
};

export function isValidEvidenceSource(v: unknown): v is XaiEvidenceSource {
  return typeof v === "string"
    && (XAI_EVIDENCE_SOURCES as readonly string[]).includes(v);
}

export function normalizeEvidenceSource(v: unknown): XaiEvidenceSource {
  return isValidEvidenceSource(v) ? v : "heuristic";
}

export type EvidenceSourceCounts = Record<XaiEvidenceSource, number>;

export function emptyEvidenceSourceCounts(): EvidenceSourceCounts {
  return { organic: 0, paid: 0, blended: 0, heuristic: 0, insufficient_data: 0 };
}

export interface EvidenceSourceGateResult {
  decision_evidence_source: XaiEvidenceSource;
  action: "allow" | "validate_only" | "block" | "flag_missing";
  reason: string;
  organic_share: number;
  paid_share: number;
  blended_share: number;
  total_tagged: number;
}

/**
 * Classify the majority evidence source of a group of advisor votes and
 * decide the gate action for the proposed final action.
 *
 *   - block         -> caller MUST rewrite finalAction to a non-promotion
 *                      form (e.g. "defer") and NOT allow automated execution.
 *   - validate_only -> allow, but require organic corroboration downstream.
 *   - allow         -> full promotion.
 *   - flag_missing  -> allow, but at least one vote lacked a tag.
 */
export function classifyGate(
  counts: EvidenceSourceCounts,
  finalAction: string,
  opts?: { untaggedVotes?: number },
): EvidenceSourceGateResult {
  const total = counts.organic + counts.paid + counts.blended
    + counts.heuristic + counts.insufficient_data;
  const organicShare = total ? counts.organic / total : 0;
  const paidShare    = total ? counts.paid    / total : 0;
  const blendedShare = total ? counts.blended / total : 0;

  let decisionEvSrc: XaiEvidenceSource;
  if (organicShare >= 0.6) decisionEvSrc = "organic";
  else if (paidShare >= 0.6) decisionEvSrc = "paid";
  else if (organicShare + blendedShare + paidShare >= 0.5) decisionEvSrc = "blended";
  else if (counts.insufficient_data > counts.heuristic) decisionEvSrc = "insufficient_data";
  else decisionEvSrc = "heuristic";

  const promoting = /^(amplify|act|promote|scale|launch)/i.test(finalAction);
  const untagged = opts?.untaggedVotes ?? 0;

  let action: EvidenceSourceGateResult["action"] = "allow";
  let reason = "organic-first";
  if (decisionEvSrc === "insufficient_data") {
    action = "block";
    reason = "insufficient_data may not trigger automated promotion";
  } else if (decisionEvSrc === "heuristic" && promoting) {
    action = "block";
    reason = "heuristic evidence may not be treated as proven for promotion";
  } else if (decisionEvSrc === "paid" && promoting) {
    action = "validate_only";
    reason = "paid evidence is validation-only; requires organic corroboration";
  } else if (decisionEvSrc === "blended" && promoting) {
    action = "validate_only";
    reason = "blended evidence requires explicit organic majority";
  } else if (untagged > 0) {
    action = "flag_missing";
    reason = `${untagged} advisor vote(s) missing evidence_source`;
  }

  return {
    decision_evidence_source: decisionEvSrc,
    action,
    reason,
    organic_share: organicShare,
    paid_share: paidShare,
    blended_share: blendedShare,
    total_tagged: total,
  };
}