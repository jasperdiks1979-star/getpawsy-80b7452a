// copy-compliance-sanitizer
//
// Centralized banned-term scrubber for ALL ad copy that lands in
// cinematic_ad_jobs / preflight / queue-render. Replaces high-risk
// medical/efficacy claims with compliant, on-brand alternatives so that
// preflight's BANNED_COPY guard does not flag a perfectly fine concept.
//
// Rules:
//   - case-insensitive, word-boundary aware
//   - preserves leading capitalization of the original token
//   - never throws; null/undefined → ""
//   - idempotent (running twice produces the same result)
//
// IMPORTANT: keep this list aligned with BANNED_COPY in
// cinematic-ad-preflight/index.ts so a sanitized payload is guaranteed
// to pass the preflight banned_copy gate.

type Replacement = { from: string; to: string };

const REPLACEMENTS: Replacement[] = [
  // medical/efficacy claims
  { from: "healing", to: "soothing" },
  { from: "heals", to: "soothes" },
  { from: "healed", to: "soothed" },
  { from: "heal", to: "comfort" },
  { from: "cures", to: "helps" },
  { from: "cured", to: "helped" },
  { from: "cure", to: "help" },
  { from: "treats", to: "supports" },
  { from: "treated", to: "supported" },
  { from: "treatment", to: "support" },
  { from: "therapeutic", to: "supportive" },
  { from: "medical", to: "supportive" },
  { from: "prevent disease", to: "support a calmer routine" },
  { from: "pain relief", to: "more comfort" },
  { from: "anxiety cure", to: "calmer routine" },
  { from: "anxiety relief", to: "calmer routine" },
  // brand-policy buzzwords that trip preflight or GMC
  { from: "vet-approved", to: "trusted by pet parents" },
  { from: "vet approved", to: "trusted by pet parents" },
  { from: "eco-friendly", to: "thoughtfully made" },
  { from: "eco friendly", to: "thoughtfully made" },
  { from: "dropship", to: "ship" },
  { from: "best price", to: "great value" },
  { from: "cheapest", to: "great value" },
  { from: "#1", to: "top-rated" },
  { from: "number one", to: "top-rated" },
];

function preserveCase(original: string, replacement: string): string {
  if (!original) return replacement;
  if (original.toUpperCase() === original && original.length > 1) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type SanitizeResult = {
  text: string;
  changed: boolean;
  replacements: Array<{ from: string; to: string }>;
};

export function sanitizeCompliance(input: unknown): SanitizeResult {
  if (input == null) return { text: "", changed: false, replacements: [] };
  let text = String(input);
  const replacements: Array<{ from: string; to: string }> = [];
  for (const r of REPLACEMENTS) {
    // Word-boundary for normal alphanumeric terms; for phrases/specials (e.g. "#1")
    // we anchor with non-word lookarounds where possible but accept simple match.
    const pattern = /^[a-z0-9]/i.test(r.from) && /[a-z0-9]$/i.test(r.from)
      ? new RegExp(`\\b${escapeRegex(r.from)}\\b`, "gi")
      : new RegExp(escapeRegex(r.from), "gi");
    text = text.replace(pattern, (m) => {
      replacements.push({ from: m, to: r.to });
      return preserveCase(m, r.to);
    });
  }
  return { text, changed: replacements.length > 0, replacements };
}

/** Convenience: sanitize a string and just return the cleaned text. */
export function s(input: unknown): string {
  return sanitizeCompliance(input).text;
}

/** Deep sanitize an object's string leaves (creative kit, storyboard, etc). */
export function sanitizeDeep<T>(value: T): { value: T; changed: boolean } {
  let changed = false;
  const walk = (v: any): any => {
    if (typeof v === "string") {
      const r = sanitizeCompliance(v);
      if (r.changed) changed = true;
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, any> = {};
      for (const k of Object.keys(v)) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return { value: walk(value) as T, changed };
}

/** Sanitize the canonical creative-kit shape produced by cinematic-ad-prepare. */
export function sanitizeCreativeKit<K extends Record<string, any>>(kit: K): {
  kit: K;
  changed: boolean;
  log: Array<{ field: string; replacements: SanitizeResult["replacements"] }>;
} {
  const log: Array<{ field: string; replacements: SanitizeResult["replacements"] }> = [];
  let changed = false;

  const scrubField = (field: string, val: unknown) => {
    const r = sanitizeCompliance(val);
    if (r.changed) {
      changed = true;
      log.push({ field, replacements: r.replacements });
    }
    return r.text;
  };

  const out: any = { ...kit };

  if (typeof out.pin_title === "string") out.pin_title = scrubField("pin_title", out.pin_title);
  if (typeof out.pin_description === "string") out.pin_description = scrubField("pin_description", out.pin_description);
  if (typeof out.vo_script === "string") out.vo_script = scrubField("vo_script", out.vo_script);

  if (Array.isArray(out.hook_variants)) {
    out.hook_variants = out.hook_variants.map((h: any, i: number) => {
      if (h && typeof h.text === "string") {
        return { ...h, text: scrubField(`hook_variants[${i}].text`, h.text) };
      }
      return h;
    });
  }
  if (Array.isArray(out.cta_variants)) {
    out.cta_variants = out.cta_variants.map((c: any, i: number) => {
      if (c && typeof c.text === "string") {
        return { ...c, text: scrubField(`cta_variants[${i}].text`, c.text) };
      }
      return c;
    });
  }
  if (Array.isArray(out.hashtags)) {
    out.hashtags = out.hashtags.map((t: any, i: number) =>
      typeof t === "string" ? scrubField(`hashtags[${i}]`, t) : t,
    );
  }
  if (out.storyboard) {
    const deep = sanitizeDeep(out.storyboard);
    if (deep.changed) {
      changed = true;
      log.push({ field: "storyboard", replacements: [] });
    }
    out.storyboard = deep.value;
  }

  return { kit: out as K, changed, log };
}