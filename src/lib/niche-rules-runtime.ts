// Generic, data-driven niche detector. Operates on rule rows fetched at runtime
// from `pinterest_niche_rules` so admins can edit classification logic without
// redeploying. Mirrors the shape used by the static rules in niche-detector.ts.

export type RuntimeRule = {
  rule_id: string;
  niche: string;
  priority: number;
  enabled: boolean;
  primary_terms: string[];
  require_any: string[];
  forbid_all: string[];
};

export interface RuntimeTrace {
  haystack: string;
  niche: string;
  matchedRule: {
    rule_id: string;
    niche: string;
    matchedPrimary: string[];
    matchedRequire: string[];
  } | null;
  nearMisses: Array<{
    rule_id: string;
    niche: string;
    matchedPrimary: string[];
    missingRequire?: string[];
    blockedByForbid?: string[];
  }>;
}

const lc = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : "");

export function buildHaystack(input: {
  name?: string | null;
  slug?: string | null;
  category?: string | null;
  product_type?: string | null;
}): string {
  return [input.name, input.slug, input.category, input.product_type]
    .map(lc)
    .filter(Boolean)
    .join(" ");
}

const hits = (hay: string, words: string[]) =>
  words.filter((w) => w && hay.includes(w.toLowerCase()));

export function classifyWithRules(
  input: {
    name?: string | null;
    slug?: string | null;
    category?: string | null;
    product_type?: string | null;
  },
  rules: RuntimeRule[],
  fallback = "generic_pet",
): RuntimeTrace {
  const hay = buildHaystack(input);
  const ordered = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority || a.rule_id.localeCompare(b.rule_id));

  const nearMisses: RuntimeTrace["nearMisses"] = [];

  for (const rule of ordered) {
    const matchedPrimary = hits(hay, rule.primary_terms ?? []);
    const matchedForbid = hits(hay, rule.forbid_all ?? []);
    const matchedRequire = hits(hay, rule.require_any ?? []);
    const requireOk = !rule.require_any?.length || matchedRequire.length > 0;
    const forbidOk = !rule.forbid_all?.length || matchedForbid.length === 0;

    if (matchedPrimary.length > 0 && requireOk && forbidOk) {
      return {
        haystack: hay,
        niche: rule.niche,
        matchedRule: {
          rule_id: rule.rule_id,
          niche: rule.niche,
          matchedPrimary,
          matchedRequire,
        },
        nearMisses,
      };
    }

    if (matchedPrimary.length > 0 && (!requireOk || !forbidOk)) {
      nearMisses.push({
        rule_id: rule.rule_id,
        niche: rule.niche,
        matchedPrimary,
        ...(rule.require_any?.length && !requireOk
          ? { missingRequire: rule.require_any }
          : {}),
        ...(matchedForbid.length > 0 ? { blockedByForbid: matchedForbid } : {}),
      });
    }
  }

  return { haystack: hay, niche: fallback, matchedRule: null, nearMisses };
}
