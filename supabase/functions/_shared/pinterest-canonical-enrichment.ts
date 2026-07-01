// ─────────────────────────────────────────────────────────────────────────────
// Genesis V9.3 — Canonical Pinterest Draft Enrichment
// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for Pinterest draft classification + copy
// naturalization. Every producer that writes into `pinterest_pin_queue`
// MUST call `applyCanonicalEnrichment` and `assertQueueRowEnriched`.
//
// Fail-closed at the DB layer is enforced by the trigger
// `pinterest_pin_queue_v93_enrichment_trg` (see 2026-07-01 migration),
// which auto-derives classification when producers forget and REJECTS
// the write if the metadata still cannot be produced.
//
// DO NOT DUPLICATE THIS LOGIC. If you need a variant, extend this file.

export const CANONICAL_ENRICHMENT_VERSION = "v9.3";

export type CanonicalContentType =
  | "lifestyle"
  | "educational"
  | "problem_solution"
  | "seasonal"
  | "entertainment";

export interface CanonicalClassification {
  content_type: CanonicalContentType;
  pin_type: CanonicalContentType;
  creative_style: string;
  creative_goal: string;
  content_strategy: string;
}

/** Deterministic niche → Pinterest-native classification. No AI, no drift. */
export function deriveContentClassification(
  niche: string | null | undefined,
): CanonicalClassification {
  const n = String(niche ?? "").toLowerCase();
  if (
    n.includes("training") || n.includes("dental") || n.includes("grooming") ||
    n.includes("feeder") || n.includes("bowl_station") ||
    n.includes("fountain") || n.includes("interactive_toy") ||
    n.includes("supplement") || n.includes("potty")
  ) {
    return {
      content_type: "educational",
      pin_type: "educational",
      creative_style: "helpful_guide",
      creative_goal: "teach_and_earn_save",
      content_strategy: "how_to_do_it_right",
    };
  }
  if (
    n.includes("litter") || n.includes("pet_camera") || n.includes("dog_car") ||
    n.includes("carrier") || n.includes("gps") || n.includes("harness")
  ) {
    return {
      content_type: "problem_solution",
      pin_type: "problem_solution",
      creative_style: "before_after_story",
      creative_goal: "solve_pet_parent_pain",
      content_strategy: "problem_first_then_fix",
    };
  }
  if (n.includes("scratcher") || n.includes("treats")) {
    return {
      content_type: "entertainment",
      pin_type: "entertainment",
      creative_style: "playful_moment",
      creative_goal: "spark_delight_and_save",
      content_strategy: "pet_joy_first",
    };
  }
  if (
    n.includes("outdoor") || n.includes("enclosure") ||
    n.includes("clothing")
  ) {
    return {
      content_type: "seasonal",
      pin_type: "seasonal",
      creative_style: "seasonal_scene",
      creative_goal: "seasonal_relevance",
      content_strategy: "right_product_right_season",
    };
  }
  return {
    content_type: "lifestyle",
    pin_type: "lifestyle",
    creative_style: "cozy_home_scene",
    creative_goal: "inspire_and_earn_save",
    content_strategy: "real_home_pet_routine",
  };
}

const NATIVE_LIFESTYLE_TERMS = [
  "cozy", "morning", "sunny", "evening", "weekend", "kitchen",
  "living room", "bedroom", "patio", "couch", "outdoor",
];
const NATIVE_HELPFUL_TERMS = [
  "how", "tips", "guide", "checklist", "best", "signs", "ways",
];
const NATIVE_EDU_TERMS = [
  "guide", "training", "behavior", "vet", "expert", "explained",
];
const NATIVE_SHOWCASE_TERMS = [
  "buy", "sale", "discount", "% off", "shop now", "new arrival",
  "shop", "deal",
];

function stripShowcaseLanguage(text: string): string {
  let out = text ?? "";
  out = out.replace(/\bShop now[^.]*\.?/gi, "").trim();
  out = out.replace(/\bShop\s+[A-Z][A-Za-z ]{2,30}\.?/g, "").trim();
  for (const t of NATIVE_SHOWCASE_TERMS) {
    const re = new RegExp(
      `\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "gi",
    );
    out = out.replace(re, "").trim();
  }
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,])/g, "$1").trim();
}

function hasAny(text: string, terms: string[]): boolean {
  const t = (text ?? "").toLowerCase();
  return terms.some((w) => t.includes(w));
}

export interface NaturalizableCopy {
  title: string;
  description: string;
  overlay?: string;
  cta?: string;
  brandWordmark?: string;
}

export function naturalizeCopyForNative<T extends NaturalizableCopy>(
  copy: T,
  classification: CanonicalClassification,
  _niche?: string,
): T {
  const ct = classification.content_type;
  let desc = stripShowcaseLanguage(copy.description ?? "");
  const lifestyleAdd: Record<CanonicalContentType, string> = {
    lifestyle: "A cozy morning routine, right at home in the living room.",
    educational: "A simple guide to what actually works for daily use.",
    problem_solution:
      "Signs it's time to fix this, and the ways parents solve it.",
    seasonal:
      "Made for weekend outdoor time on the patio or in the garden.",
    entertainment: "A playful evening moment on the couch that pets love.",
  };
  const helpfulAdd: Record<CanonicalContentType, string> = {
    lifestyle: "Tips for building a calmer, cozier home for your pet.",
    educational:
      "How to introduce it step by step, with expert-approved guidance.",
    problem_solution: "How to spot the signs early and the best ways to help.",
    seasonal: "Best ways to keep pets comfortable through the season.",
    entertainment: "Fun ways to keep your pet engaged during the evening.",
  };
  if (!hasAny(desc, NATIVE_LIFESTYLE_TERMS)) {
    desc = `${desc} ${lifestyleAdd[ct]}`.trim();
  }
  const needsHelpful = ct === "educational" ||
    ct === "problem_solution" || ct === "seasonal";
  const helpfulPool = ct === "educational"
    ? NATIVE_EDU_TERMS
    : NATIVE_HELPFUL_TERMS;
  if (needsHelpful && !hasAny(desc, helpfulPool)) {
    desc = `${desc} ${helpfulAdd[ct]}`.trim();
  }
  if (!needsHelpful && !hasAny(desc, NATIVE_HELPFUL_TERMS)) {
    desc = `${desc} ${helpfulAdd[ct]}`.trim();
  }
  desc = desc.replace(/\s{2,}/g, " ").trim().slice(0, 480);
  return { ...copy, description: desc };
}

/**
 * Applies canonical enrichment to a `pinterest_pin_queue` insert/update row.
 * Producers pass in the row they intend to write; this returns an enriched
 * copy with `meta.*`, `content_type`, and (when the row carries copy) a
 * naturalized description.
 */
export function applyCanonicalEnrichment<
  R extends Record<string, unknown> & {
    meta?: Record<string, unknown> | null;
    hook_group?: string | null;
    category_key?: string | null;
    content_type?: string | null;
    pin_description?: string | null;
  },
>(
  row: R,
  opts: { niche?: string | null; source?: string; generator?: string } = {},
): R {
  const niche = opts.niche ?? row.hook_group ?? row.category_key ?? null;
  const c = deriveContentClassification(niche);
  const prevMeta = (row.meta ?? {}) as Record<string, unknown>;
  const meta: Record<string, unknown> = {
    ...prevMeta,
    pin_type: prevMeta.pin_type ?? c.pin_type,
    content_type: prevMeta.content_type ?? c.content_type,
    creative_style: prevMeta.creative_style ?? c.creative_style,
    creative_goal: prevMeta.creative_goal ?? c.creative_goal,
    content_strategy: prevMeta.content_strategy ?? c.content_strategy,
    enrichment_version: CANONICAL_ENRICHMENT_VERSION,
    genesis_v91_aligned: true,
  };
  if (opts.source && !meta.creative_source) meta.creative_source = opts.source;
  if (opts.generator && !meta.generator) meta.generator = opts.generator;
  const out: R = {
    ...row,
    meta,
    content_type:
      (row.content_type && row.content_type !== "product"
        ? row.content_type
        : c.content_type) as R["content_type"],
  };
  if (typeof row.pin_description === "string" && row.pin_description) {
    const naturalized = naturalizeCopyForNative(
      { title: "", description: row.pin_description },
      c,
      niche ?? undefined,
    );
    (out as Record<string, unknown>).pin_description = naturalized.description;
  }
  return out;
}

/** Fail-closed validator; throws with an explicit reason if incomplete. */
export function assertQueueRowEnriched(row: {
  content_type?: string | null;
  meta?: Record<string, unknown> | null;
}): void {
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const missing: string[] = [];
  if (!row.content_type || row.content_type === "product") {
    missing.push("content_type");
  }
  if (!meta.pin_type) missing.push("meta.pin_type");
  if (!meta.content_type) missing.push("meta.content_type");
  if (!meta.creative_style) missing.push("meta.creative_style");
  if (!meta.creative_goal) missing.push("meta.creative_goal");
  if (!meta.content_strategy) missing.push("meta.content_strategy");
  if (missing.length) {
    throw new Error(`v93_enrichment_missing:${missing.join(",")}`);
  }
}