// cinematic-text-safe-rewriter
//
// Deterministic auto-fix for overlay text that fails the safe-area QA gate
// (text_safe_area / text_cut_off). Produces strings guaranteed to wrap into
// ≤ MAX_LINES lines of ≤ MAX_LINE_CHARS characters each, which is exactly the
// contract enforced by validateTextSafeArea() in pinterest-video-meta.ts and
// the renderer's safeAreaValidator (remotion/src/lib/safeZone.ts).
//
// Strategy (deterministic, no LLM, idempotent):
//   1. Normalize whitespace, strip emoji-padding and surrounding quotes.
//   2. Drop a small set of filler words ("the", "a", "an", "just", "really",
//      "very", "so", "that") if the result still fails width.
//   3. Greedy-wrap; if it still doesn't fit MAX_LINES × MAX_LINE_CHARS,
//      hard-truncate to (MAX_LINES * MAX_LINE_CHARS - 1) and append an ellipsis
//      on a word boundary.
//
// Per-field caps are tuned per renderer overlay role:
//   hook_text   → 2 lines × 34ch  = 68 (kept short to read in <2s)
//   pin_title   → 2 lines × 34ch  = 68
//   cta_text    → 1 line  × 24ch  = 24 (CTA must fit one row)
//   scene caption → 2 lines × 34ch (same as hook)

const MAX_LINE_CHARS = 34;
const FILLER_WORDS = new Set([
  "the", "a", "an", "just", "really", "very", "so", "that", "actually",
]);

function wrapLines(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function fits(text: string, maxLines: number, maxChars: number): boolean {
  const lines = wrapLines(text, maxChars);
  return lines.length <= maxLines && lines.every((l) => l.length <= maxChars);
}

function stripFiller(text: string): string {
  return text
    .split(/\s+/)
    .filter((w, i, arr) => {
      // Never drop the first word, the last word, or words longer than 5 chars.
      if (i === 0 || i === arr.length - 1) return true;
      const bare = w.replace(/[.,!?;:]/g, "").toLowerCase();
      return !FILLER_WORDS.has(bare);
    })
    .join(" ");
}

function hardTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxChars * 0.5 ? slice.slice(0, lastSpace) : slice;
  return cut.replace(/[\s,.;:!?-]+$/, "") + "…";
}

/** Public: shorten ONE field deterministically to fit (maxLines × maxChars). */
export function shortenForSafeZone(
  raw: string | null | undefined,
  maxLines = 2,
  maxChars = MAX_LINE_CHARS,
): { text: string; changed: boolean; reason: string | null } {
  if (!raw) return { text: "", changed: false, reason: null };
  let text = raw
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const original = text;
  if (!text) return { text: "", changed: original.length > 0, reason: original ? "whitespace_only" : null };

  if (fits(text, maxLines, maxChars)) {
    return { text, changed: text !== original, reason: text !== original ? "normalized" : null };
  }

  const stripped = stripFiller(text);
  if (fits(stripped, maxLines, maxChars)) {
    return { text: stripped, changed: true, reason: "filler_removed" };
  }
  text = stripped;

  const cap = maxLines * maxChars;
  const truncated = hardTruncate(text, cap);
  if (fits(truncated, maxLines, maxChars)) {
    return { text: truncated, changed: true, reason: "truncated" };
  }
  // Last resort: enforce single-line cap.
  const singleLine = hardTruncate(text, maxChars);
  return { text: singleLine, changed: true, reason: "single_line_truncated" };
}

export type SafeRewriteResult = {
  changed: boolean;
  mutations: Array<{ field: string; reason: string; before: string; after: string }>;
  hook_text?: string;
  pin_title?: string;
  cta_text?: string;
  scene_plan?: any[] | null;
};

/**
 * Public: rewrite hook_text, pin_title, cta_text, and any scene_plan caption
 * so the resulting strings all pass the safe-zone width gate. Returns the new
 * values plus a per-field mutation log for telemetry. Idempotent — calling
 * twice with the same inputs produces no further changes.
 */
export function rewriteForSafeZone(input: {
  hook_text?: string | null;
  pin_title?: string | null;
  cta_text?: string | null;
  scene_plan?: any[] | null;
}): SafeRewriteResult {
  const out: SafeRewriteResult = { changed: false, mutations: [] };

  const fields: Array<{ key: "hook_text" | "pin_title" | "cta_text"; maxLines: number; maxChars: number }> = [
    { key: "hook_text", maxLines: 2, maxChars: MAX_LINE_CHARS },
    { key: "pin_title", maxLines: 2, maxChars: MAX_LINE_CHARS },
    { key: "cta_text", maxLines: 1, maxChars: 24 },
  ];
  for (const f of fields) {
    const r = shortenForSafeZone(input[f.key], f.maxLines, f.maxChars);
    if (r.changed) {
      out.changed = true;
      out.mutations.push({ field: f.key, reason: r.reason ?? "rewritten", before: String(input[f.key] ?? ""), after: r.text });
      out[f.key] = r.text;
    }
  }

  if (Array.isArray(input.scene_plan) && input.scene_plan.length > 0) {
    let sceneChanged = false;
    const newPlan = input.scene_plan.map((s: any, i: number) => {
      const updated: any = { ...s };
      if (typeof s?.caption === "string" && s.caption.trim()) {
        const r = shortenForSafeZone(s.caption, 2, MAX_LINE_CHARS);
        if (r.changed) {
          sceneChanged = true;
          out.mutations.push({ field: `scene[${i}].caption`, reason: r.reason ?? "rewritten", before: s.caption, after: r.text });
          updated.caption = r.text;
        }
      }
      // Clamp y_pct into the 12–82 safe band so the renderer can't place
      // captions in the reserved status-bar / CTA zones.
      if (typeof s?.y_pct === "number") {
        if (s.y_pct < 12) { updated.y_pct = 12; sceneChanged = true; out.mutations.push({ field: `scene[${i}].y_pct`, reason: "clamped_top", before: String(s.y_pct), after: "12" }); }
        else if (s.y_pct > 82) { updated.y_pct = 82; sceneChanged = true; out.mutations.push({ field: `scene[${i}].y_pct`, reason: "clamped_bottom", before: String(s.y_pct), after: "82" }); }
      }
      return updated;
    });
    if (sceneChanged) {
      out.changed = true;
      out.scene_plan = newPlan;
    }
  }

  return out;
}