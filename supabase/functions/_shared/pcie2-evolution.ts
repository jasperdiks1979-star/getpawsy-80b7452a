// PCIE2 Creative Evolution Guard
// Ensures generated creatives differ enough from prior siblings before they are marked ready.
// A candidate passes when:
//   1) cosine similarity vs every prior sibling embedding is below SIM_THRESHOLD, AND
//   2) at least MIN_DIFF_AXES of the discrete creative axes differ from the most recent sibling.
// Used by pcie2-creative-engine (and any future PCIE2 generator) — server-side only.
import { cosine } from "./pcie2-ai.ts";

export const SIM_THRESHOLD = 0.88;
export const MIN_DIFF_AXES = 3;
export const MAX_EVOLUTION_ATTEMPTS = 5;

export type CreativeAxes = {
  headline?: string | null;
  hook?: string | null;
  cta?: string | null;
  layout?: string | null;
  camera_angle?: string | null;
  lighting?: string | null;
  background?: string | null;
  breed?: string | null;
  pose?: string | null;
  composition?: string | null;
  negative_prompt?: string | null;
  style?: string | null;
};

export function maxSimilarity(candidate: number[], siblings: number[][]): number {
  let max = 0;
  for (const s of siblings) {
    const v = cosine(candidate, s);
    if (v > max) max = v;
  }
  return max;
}

export function axisDiffCount(candidate: CreativeAxes, latest: CreativeAxes | null | undefined): number {
  if (!latest) return Object.keys(candidate).length;
  const keys = Object.keys(candidate) as (keyof CreativeAxes)[];
  let diff = 0;
  for (const k of keys) {
    const a = (candidate[k] ?? "").toString().trim().toLowerCase();
    const b = (latest[k] ?? "").toString().trim().toLowerCase();
    if (a && a !== b) diff++;
  }
  return diff;
}

export function evolutionVerdict(opts: {
  candidate: number[];
  siblings: number[][];
  candidateAxes: CreativeAxes;
  latestAxes?: CreativeAxes | null;
}): { ok: boolean; reason: string; similarity: number; axesDiff: number } {
  const similarity = maxSimilarity(opts.candidate, opts.siblings);
  const axesDiff = axisDiffCount(opts.candidateAxes, opts.latestAxes ?? null);
  if (similarity >= SIM_THRESHOLD) {
    return { ok: false, reason: "similarity_too_high", similarity, axesDiff };
  }
  if (axesDiff < MIN_DIFF_AXES) {
    return { ok: false, reason: "axes_diff_too_low", similarity, axesDiff };
  }
  return { ok: true, reason: "passed", similarity, axesDiff };
}