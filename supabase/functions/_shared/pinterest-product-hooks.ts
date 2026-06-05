// ─────────────────────────────────────────────────────────────────────────────
// Pinterest — Per-Product Hook Generator
// ─────────────────────────────────────────────────────────────────────────────
// Replaces the generic HOOK_BANK as the primary source of Pinterest pin
// headlines. Hooks here are generated from the actual product's title,
// description, category, and inferred benefits — then validated against a
// niche-specific banned-terms list and scored for semantic relevance before
// being accepted.
//
// Returns N short headlines (≤42 chars) with a relevance score and a source
// flag (`ai_product` on success, `fallback_bank` when AI fails repeatedly).
// Caller is expected to substitute these into the per-brief strategy so the
// downstream image model uses a product-truthful hook.
// ─────────────────────────────────────────────────────────────────────────────

import type { NicheKey, StyleDNA } from "./pinterest-style-dna.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const TEXT_MODEL =
  Deno.env.get("PINTEREST_CD_TEXT_MODEL") || "google/gemini-3-flash-preview";

export interface ProductHook {
  headline: string;          // ≤ 42 chars, no trailing punctuation
  rationale: string;         // why this hook fits the product
  source: "ai_product" | "fallback_bank";
  relevance: number;         // 0-100
  archetype?: HookArchetype;
}

export type HookArchetype = "problem" | "benefit" | "curiosity" | "emotional" | "outcome";
export const ARCHETYPES: HookArchetype[] = ["problem", "benefit", "curiosity", "emotional", "outcome"];

export interface HookGenInput {
  name: string;
  description?: string | null;
  category?: string | null;
  features?: string[] | null;
  benefits?: string[] | null;
}

// ── Niche-specific banned hook terms ──────────────────────────────────────
//
// Each niche lists words that MUST NOT appear in a hook for that niche
// because they semantically belong to a different product class. This is
// the guard that prevents toy hooks landing on supplements, supplement
// hooks landing on toys, fountain hooks on litter boxes, etc.
export const NICHE_BANNED_HOOK_TERMS: Partial<Record<NicheKey, string[]>> = {
  supplement: [
    "toy","play","fetch","tug","chase","ball","laser","squeak",
    "litter","scoop","odor","scratch","climb","tree","perch",
    "fountain","hydrat","drink","leash","harness","stroller","carrier",
    "bed","sleep","nap","cozy corner",
  ],
  treats: [
    "toy","play","fetch","chase","ball","laser",
    "litter","scoop","odor","scratch","climb","fountain","hydrat",
    "leash","harness","stroller","bed","sleep",
  ],
  interactive_toy: [
    "tummy","gut","digest","probiotic","supplement","vitamin","immune","joint",
    "litter","scoop","odor","scratch","climb","tree","perch",
    "fountain","hydrat","drink","leash","harness","stroller","carrier",
    "bed","sleep","nap","scoop",
  ],
  cat_litter: [
    "toy","play","fetch","chase","probiotic","tummy","gut",
    "fountain","hydrat","drink","bed","sleep","scratch","climb",
    "leash","harness","carrier","stroller",
  ],
  cat_fountain: [
    "litter","odor","scoop","toy","play","probiotic","tummy",
    "scratch","climb","tree","bed","sleep","leash","harness",
  ],
  cat_tree: [
    "litter","odor","scoop","probiotic","tummy","fountain","hydrat",
    "leash","harness","carrier","stroller","bed sleep","nap",
  ],
  cat_scratcher: [
    "litter","odor","scoop","probiotic","tummy","fountain","hydrat",
    "leash","harness","stroller","bed","sleep","toy","fetch",
  ],
  cat_bed: [
    "litter","odor","scoop","probiotic","tummy","fountain","hydrat",
    "leash","harness","stroller","scratch","climb","toy","fetch",
  ],
  dog_bed: [
    "litter","odor","scoop","probiotic","tummy","fountain","hydrat",
    "scratch","climb","tree","perch","toy","fetch",
  ],
  calming_bed: [
    "litter","odor","scoop","probiotic","tummy","fountain","hydrat",
    "scratch","climb","tree","perch","toy","fetch","leash","harness",
  ],
  dog_harness: [
    "litter","odor","scoop","probiotic","tummy","fountain","hydrat",
    "scratch","climb","tree","perch","bed","sleep","toy","fetch",
  ],
  dog_collar: [
    "litter","odor","scoop","probiotic","tummy","fountain","hydrat",
    "scratch","climb","tree","perch","bed","sleep",
  ],
  dog_carrier: [
    "litter","odor","scoop","probiotic","tummy","fountain","hydrat",
    "scratch","climb","tree","perch","toy","fetch","bed","sleep",
  ],
  cat_carrier: [
    "litter","odor","scoop","probiotic","tummy","fountain","hydrat",
    "scratch","climb","tree","perch","toy","fetch",
  ],
  feeder: [
    "litter","odor","scoop","scratch","climb","tree","perch",
    "leash","harness","stroller","carrier","bed","sleep","toy","fetch",
  ],
  bowl_station: [
    "litter","odor","scoop","scratch","climb","tree","perch",
    "leash","harness","stroller","carrier","bed","sleep","toy","fetch",
  ],
  grooming: [
    "litter","scoop","probiotic","tummy","fountain","hydrat",
    "scratch","climb","tree","perch","leash","harness","carrier","stroller",
    "bed","sleep","toy","fetch",
  ],
  dental_care: [
    "litter","scoop","fountain","hydrat","scratch","climb","tree",
    "leash","harness","stroller","carrier","bed","sleep","toy","fetch",
  ],
  dog_training: [
    "litter","odor","scoop","probiotic","tummy","fountain","hydrat",
    "scratch","climb","tree","perch","bed","sleep","toy","fetch","fountain",
  ],
  outdoor_house: [
    "litter","odor","scoop","probiotic","tummy","fountain","hydrat",
    "scratch","climb","tree","perch","leash","harness","toy","fetch",
  ],
  potty_training: [
    "probiotic","tummy","gut","fountain","hydrat","scratch","climb","tree",
    "leash","harness","carrier","stroller","bed","sleep","toy","fetch",
  ],
  pet_camera: [
    "litter","odor","scoop","probiotic","tummy","fountain","hydrat",
    "scratch","climb","tree","perch","leash","harness","bed","sleep",
  ],
  dog_clothing: [
    "litter","odor","scoop","probiotic","tummy","fountain","hydrat",
    "scratch","climb","tree","perch","bed","sleep","toy","fetch",
  ],
  dog_car: [
    "litter","scoop","probiotic","tummy","scratch","climb","tree",
    "bed","sleep","toy","fetch",
  ],
};

// ── Niche-positive lexicon (relevance scoring) ─────────────────────────────
const NICHE_POSITIVE_LEX: Partial<Record<NicheKey, string[]>> = {
  supplement: ["tummy","gut","digest","calm","health","support","chew","daily","immune","joint","probiotic","wellness","vitamin"],
  treats: ["treat","reward","tail","bite","snack","training reward","wag"],
  interactive_toy: ["play","toy","chase","fetch","tug","fun","engage","bored","energy","enrich"],
  cat_litter: ["litter","odor","smell","scoop","clean","tidy","fresh","box","handsfree","hands-free"],
  cat_fountain: ["water","hydrat","drink","fountain","thirst","cool","fresh","sip","flow"],
  cat_tree: ["climb","scratch","perch","tower","condo","tree","jump","lounge","relax"],
  cat_scratcher: ["scratch","claw","sisal","post","furniture","couch"],
  cat_bed: ["nap","cozy","rest","sunbeam","curl","window"],
  dog_bed: ["rest","sleep","comfort","orthopedic","joint","cozy","support","spot"],
  calming_bed: ["calm","anxiety","cozy","sleep","safe","comfort","settle","relax"],
  dog_harness: ["walk","harness","control","trail","hike","adventure","fit"],
  dog_collar: ["walk","collar","leash","color","style","comfort","fit"],
  dog_carrier: ["travel","stroller","ride","walk","park","adventure"],
  cat_carrier: ["travel","carrier","calm","vet","trip"],
  feeder: ["feed","meal","schedule","portion","automatic","smart","mornings"],
  bowl_station: ["bowl","meal","feeding","kitchen","tidy","station"],
  grooming: ["groom","brush","shed","coat","fur","clean","wash","nail","bath"],
  dental_care: ["teeth","breath","dental","brush","clean","mouth"],
  dog_training: ["calm","train","routine","behaved","freedom","focus"],
  outdoor_house: ["outside","backyard","shelter","weather","cozy"],
  potty_training: ["potty","indoor","balcony","mess","fresh","tidy"],
  pet_camera: ["watch","see","monitor","home","peace","check"],
  dog_clothing: ["coat","jacket","rain","warm","dry","wear"],
  dog_car: ["road","trip","drive","car","seat","cover","mess"],
  generic_pet: [],
};

const STOPWORDS = new Set([
  "the","and","with","from","your","that","this","they","them","their",
  "you","for","are","but","not","have","has","was","will","one","all",
  "dogs","cats","pet","pets","made","help","helps","great","amazing",
  "best","love","loved","perfect","really","also","just","very","more",
  "into","over","under","every","each","when","what","why","how",
]);

function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z]{4,}/g) || []).filter((t) => !STOPWORDS.has(t));
}

/** Score a hook 0-100 against the product + niche lexicon. */
export function scoreHookRelevance(
  hook: string,
  product: HookGenInput,
  niche: NicheKey,
): { score: number; banned?: string } {
  const text = hook.toLowerCase();
  const banned = (NICHE_BANNED_HOOK_TERMS[niche] || []).find((w) => text.includes(w));
  if (banned) return { score: 0, banned };
  let s = 50;
  const pos = NICHE_POSITIVE_LEX[niche] || [];
  const posHits = pos.filter((w) => text.includes(w)).length;
  s += Math.min(40, posHits * 14);
  const productTokens = new Set([
    ...tokens(product.name || ""),
    ...tokens(product.description || "").slice(0, 60),
    ...tokens(product.category || ""),
  ]);
  const hookTokens = tokens(hook);
  const overlap = hookTokens.filter((t) => productTokens.has(t)).length;
  if (overlap > 0) s += Math.min(15, overlap * 8);
  // Penalize generic filler hooks
  if (/^(the\s+\w+\s+(we|they|she|he)\s+)/i.test(hook)) s -= 10;
  return { score: Math.max(0, Math.min(100, Math.round(s))) };
}

function fallbackHooks(product: HookGenInput, dna: StyleDNA, count: number): ProductHook[] {
  // Last-resort: blend product name keyword with niche DNA hook bank.
  // Marked clearly so ops can find/regenerate later.
  const bank = dna.hook_bank.slice(0, count);
  return bank.map((h) => ({
    headline: h.length > 42 ? h.slice(0, 41).trimEnd() + "…" : h,
    rationale: "fallback:dna_hook_bank",
    source: "fallback_bank" as const,
    relevance: 60,
  }));
}

/**
 * Generate N product-truthful Pinterest hooks for `product` in `niche`.
 * Each hook is validated against `NICHE_BANNED_HOOK_TERMS[niche]` and scored
 * for semantic relevance. Anything below `minRelevance` (default 80) is
 * discarded and the AI is asked to retry up to `maxRetries` times. If we
 * still can't get N clean hooks, we top up from the DNA hook bank and flag
 * those entries `source='fallback_bank'`.
 */
export async function generateProductHooks(args: {
  product: HookGenInput;
  niche: NicheKey;
  dna: StyleDNA;
  count: number;
  minRelevance?: number;
  maxRetries?: number;
  candidateCount?: number;
}): Promise<ProductHook[]> {
  const { product, niche, dna, count } = args;
  const minRelevance = args.minRelevance ?? 90;
  const maxRetries = args.maxRetries ?? 2;
  // Always request at least 5 candidates per product so we can pick the
  // top-scoring N. The caller still gets back exactly `count` hooks.
  const candidateCount = Math.max(args.candidateCount ?? 5, count);

  if (!LOVABLE_API_KEY) return fallbackHooks(product, dna, count);

  const banned = NICHE_BANNED_HOOK_TERMS[niche] || [];
  const positive = NICHE_POSITIVE_LEX[niche] || [];

  const sys = [
    "You are a senior DTC copywriter for a premium US pet brand.",
    "Write Pinterest pin headlines that describe the EXACT product the user provides.",
    "Hooks MUST be grounded in the product's name, description, category, and stated benefits.",
    "Never reuse hooks from other product categories (no toy phrasing on supplements, no supplement phrasing on toys, etc.).",
    "Each hook ≤42 characters, no emojis, no hashtags, no trailing punctuation.",
    "Voice: confident, US-native, premium but warm. No clickbait, no exaggerated claims, no medical/legal claims.",
  ].join(" ");

  const tools = [
    {
      type: "function",
      function: {
        name: "product_hooks",
        description: "Return N product-truthful Pinterest headlines.",
        parameters: {
          type: "object",
          properties: {
            hooks: {
              type: "array",
              minItems: candidateCount,
              maxItems: candidateCount + 2,
              items: {
                type: "object",
                properties: {
                  headline: { type: "string", maxLength: 42 },
                  rationale: { type: "string" },
                },
                required: ["headline", "rationale"],
                additionalProperties: false,
              },
            },
          },
          required: ["hooks"],
          additionalProperties: false,
        },
      },
    },
  ];

  const baseUser = {
    product_name: product.name,
    product_description: (product.description || "").slice(0, 1200),
    product_category: product.category || dna.label,
    product_features: product.features || [],
    product_benefits: product.benefits || [],
    niche_key: niche,
    niche_label: dna.label,
    must_avoid_words: banned,
    encouraged_concepts: positive,
    rules: {
      max_chars: 42,
      count: candidateCount,
      must_describe_this_product: true,
      must_not_reference_other_categories: true,
      no_medical_claims: true,
    },
  };

  const accepted: ProductHook[] = [];
  let rejectionFeedback: Array<{ headline: string; reason: string }> = [];

  for (let attempt = 0; attempt <= maxRetries && accepted.length < candidateCount; attempt++) {
    const needed = candidateCount - accepted.length;
    const userPayload = {
      ...baseUser,
      rules: { ...baseUser.rules, count: needed },
      previous_rejections: rejectionFeedback,
    };

    let raw: any[] = [];
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: TEXT_MODEL,
          messages: [
            { role: "system", content: sys },
            {
              role: "user",
              content:
                `Write ${needed} Pinterest headlines for THIS product only. ` +
                `Each headline must be obviously about this product's function, not about generic pet life.\n\n` +
                JSON.stringify(userPayload, null, 2),
            },
          ],
          tools,
          tool_choice: { type: "function", function: { name: "product_hooks" } },
        }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        console.warn(`[product-hooks] gateway ${resp.status}: ${t.slice(0, 160)}`);
        break;
      }
      const data = await resp.json();
      const call = data?.choices?.[0]?.message?.tool_calls?.[0];
      const argsJson = JSON.parse(call?.function?.arguments || "{}");
      raw = Array.isArray(argsJson.hooks) ? argsJson.hooks : [];
    } catch (e) {
      console.warn("[product-hooks] AI call failed", (e as Error).message);
      break;
    }

    rejectionFeedback = [];
    for (const h of raw) {
      const headline = String(h?.headline || "").replace(/[.\s]+$/g, "").slice(0, 42).trim();
      if (!headline) continue;
      // De-duplicate within the batch
      if (accepted.some((a) => a.headline.toLowerCase() === headline.toLowerCase())) continue;
      const { score, banned: hit } = scoreHookRelevance(headline, product, niche);
      if (hit) {
        rejectionFeedback.push({ headline, reason: `contains banned term '${hit}' for niche '${niche}'` });
        continue;
      }
      if (score < minRelevance) {
        rejectionFeedback.push({ headline, reason: `relevance ${score}<${minRelevance}; add product-specific language` });
        continue;
      }
      accepted.push({
        headline,
        rationale: String(h?.rationale || "").slice(0, 240),
        source: "ai_product",
        relevance: score,
      });
      if (accepted.length >= candidateCount) break;
    }
  }

  // Sort by relevance descending so the top `count` are the strongest hooks.
  accepted.sort((a, b) => b.relevance - a.relevance);

  if (accepted.length < count) {
    const filler = fallbackHooks(product, dna, count - accepted.length);
    accepted.push(...filler);
  }
  return accepted.slice(0, count);
}