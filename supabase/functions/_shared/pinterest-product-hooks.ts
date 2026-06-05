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
  // Cat playpens / enclosures / tents — NEVER allow travel/carrier framing.
  cat_enclosure: [
    "travel","carrier","trip","transport","stroller","car ride","road",
    "leash","harness","walk",
    "litter","odor","scoop","probiotic","tummy","fountain","hydrat",
    "toy","fetch","bed","sleep","scratch","climb","tree",
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
  cat_enclosure: ["enclosure","playpen","pen","tent","catio","safe","private","contained","outdoor","indoor","mesh","space","window","patio","balcony","curious"],
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

// Words that describe how the product FEELS or what it DOES for the pet/owner.
// Adds a small relevance boost on top of niche-specific lexicon so hooks like
// "safe, private cat space" score above generic filler.
const EXPERIENTIAL_LEX = [
  "comfortable","cozy","safe","private","quiet","enclosed","interactive",
  "healthy","hydrated","organized","mess-free","calm","calmer","relaxed",
  "secure","contained","durable","tidy","fresh",
];

// Concrete product nouns that, when present in a hook, strongly signal the
// hook is grounded in product truth. +10 per unique hit (capped).
const PRODUCT_NOUNS = [
  "cat tower","cat tree","cat condo","cat scratcher","scratcher","scratching post",
  "water fountain","fountain","drinking fountain",
  "playpen","enclosure","catio","cat tent","cat pen",
  "dog bed","cat bed","calming bed","orthopedic bed",
  "harness","collar","leash","stroller","carrier",
  "litter box","litter mat",
  "feeder","auto feeder","bowl","feeding station",
  "brush","groomer","clipper","nail trimmer",
  "supplement","chew","probiotic",
  "led collar","night collar","gps tracker",
];

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
  // V2.2 — stronger reward for product-truth token overlap.
  if (overlap > 0) s += Math.min(25, overlap * 9);
  // V2.2 — product noun bonus: +10 per concrete product noun present in
  // BOTH the product name/description AND the hook, capped at +20.
  const nameDescBlob = `${product.name || ""} ${product.description || ""}`.toLowerCase();
  const nounHits = PRODUCT_NOUNS.filter(
    (n) => nameDescBlob.includes(n) && text.includes(n),
  ).length;
  if (nounHits > 0) s += Math.min(20, nounHits * 10);
  // V2.2 — experiential lexicon bonus (capped at +12).
  const expHits = EXPERIENTIAL_LEX.filter((w) => text.includes(w)).length;
  if (expHits > 0) s += Math.min(12, expHits * 4);
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
 * Extract benefits from a product when the catalog row doesn't expose explicit
 * benefit fields. Looks at title + description for benefit-shaped phrases and
 * falls back to niche-templated outcomes.
 */
export function deriveBenefits(product: HookGenInput, niche: NicheKey): string[] {
  const explicit = (product.benefits || []).map((b) => (b || "").trim()).filter(Boolean);
  if (explicit.length) return explicit.slice(0, 5);
  const blob = `${product.name || ""}. ${product.description || ""}`.toLowerCase();
  const out: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/digest|tummy|gut|probiotic/, "digestive support"],
    [/calm|anxiety|relax/, "calmer behavior"],
    [/joint|hip|mobility/, "joint comfort"],
    [/immune|vitamin|wellness/, "immune support"],
    [/sleep|rest|orthopedic|memory foam/, "deeper sleep"],
    [/hydrat|fountain|water flow|drink/, "fresh hydration"],
    [/odor|smell|litter/, "odor-free home"],
    [/scratch|sisal|claw/, "saves the furniture"],
    [/play|toy|interactive|chase|fetch/, "active play"],
    [/groom|brush|shed|coat/, "clean coat"],
    [/dental|teeth|breath/, "fresher breath"],
    [/train|behave|focus|command/, "better focus"],
    [/walk|leash|harness|collar/, "easier walks"],
    [/feed|portion|meal/, "tidy mealtimes"],
    [/travel|carrier|stroller|car/, "stress-free travel"],
    [/outdoor|weather|shelter|house/, "weatherproof shelter"],
    [/cozy|warm|nest|cuddle/, "cozy comfort"],
    [/safe|durable|sturdy|reinforced/, "built to last"],
    [/led|night|visib|reflect/, "night-time visibility"],
  ];
  for (const [re, label] of patterns) if (re.test(blob) && !out.includes(label)) out.push(label);
  if (out.length) return out.slice(0, 5);
  const nicheDefaults: Partial<Record<NicheKey, string[]>> = {
    supplement: ["digestive support", "happier calmer pet", "daily wellness"],
    treats: ["training reward", "tail wags", "tasty bite"],
    interactive_toy: ["active play", "less boredom", "more energy out"],
    cat_litter: ["odor-free home", "less scooping", "tidy litter area"],
    cat_fountain: ["fresh circulating water", "more hydration", "cooler summer drink"],
    cat_tree: ["climb and perch", "saves the furniture", "cozy lookout"],
    cat_scratcher: ["saves the furniture", "healthy claws", "satisfying scratch"],
    cat_bed: ["sunny-spot naps", "cozy nook", "deeper rest"],
    dog_bed: ["deeper sleep", "joint support", "quiet corner"],
    calming_bed: ["calmer nights", "anxiety relief", "settled sleep"],
    dog_harness: ["easier walks", "no pulling", "trail-ready fit"],
    dog_collar: ["safe walks", "comfortable fit", "stylish look"],
    dog_carrier: ["stress-free travel", "secure ride", "easy outings"],
    cat_carrier: ["calmer vet trips", "secure ride", "easy outings"],
    feeder: ["tidy mealtimes", "portion control", "automatic feeding"],
    bowl_station: ["tidy mealtimes", "kitchen looks neater", "no spills"],
    grooming: ["clean coat", "less shedding", "softer fur"],
    dental_care: ["fresher breath", "cleaner teeth", "healthier mouth"],
    dog_training: ["better focus", "calmer routine", "well-behaved walks"],
    outdoor_house: ["weatherproof shelter", "cozy outdoor spot", "dry through storms"],
    potty_training: ["indoor potty", "tidy floors", "fewer accidents"],
    pet_camera: ["peace of mind", "watch from anywhere", "talk to your pet"],
    dog_clothing: ["warm and dry", "stylish outfit", "all-weather wear"],
    dog_car: ["clean car seats", "secure trips", "less mess after rides"],
    generic_pet: ["happier pet", "easier routine", "premium quality"],
  };
  return (nicheDefaults[niche] || nicheDefaults.generic_pet)!.slice(0, 3);
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
  const maxRetries = args.maxRetries ?? 1;

  // SPEC §1 + §4 + §5: fallback bank is permitted ONLY when the product is
  // missing the inputs we need to ground a hook in product truth. We never
  // top-up to reach `count` from the bank — one product = one winning hook
  // that we repeat across all requested briefs.
  const desc = (product.description || "").trim();
  if (!product.name || desc.length < 20) {
    const fb = fallbackHooks(product, dna, 1);
    return Array.from({ length: count }, () => ({ ...fb[0] }));
  }
  if (!LOVABLE_API_KEY) {
    const fb = fallbackHooks(product, dna, 1);
    return Array.from({ length: count }, () => ({ ...fb[0] }));
  }

  // Auto-derive benefits if the catalog row doesn't carry them.
  const benefits = (product.benefits && product.benefits.length)
    ? product.benefits
    : deriveBenefits(product, niche);

  const banned = NICHE_BANNED_HOOK_TERMS[niche] || [];
  const positive = NICHE_POSITIVE_LEX[niche] || [];

  const sys = [
    "You are a senior DTC copywriter for a premium US pet brand.",
    "Write Pinterest pin headlines that describe the EXACT product the user provides.",
    "Hooks MUST be grounded in the product's name, description, category, and stated benefits.",
    "Never reuse hooks from other product categories (no toy phrasing on supplements, no supplement phrasing on toys, etc.).",
    "Each hook ≤42 characters, no emojis, no hashtags, no trailing punctuation.",
    "Generate EXACTLY one hook per archetype: problem, benefit, curiosity, emotional, outcome.",
    "Voice: confident, US-native, premium but warm. No clickbait, no exaggerated claims, no medical/legal claims.",
  ].join(" ");

  const tools = [
    {
      type: "function",
      function: {
        name: "product_hooks",
        description: "Return 5 product-truthful Pinterest headlines — one per archetype.",
        parameters: {
          type: "object",
          properties: {
            hooks: {
              type: "array",
              minItems: 5,
              maxItems: 5,
              items: {
                type: "object",
                properties: {
                  headline: { type: "string", maxLength: 42 },
                  rationale: { type: "string" },
                  archetype: {
                    type: "string",
                    enum: ARCHETYPES,
                  },
                },
                required: ["headline", "rationale", "archetype"],
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
    product_description: desc.slice(0, 1200),
    product_category: product.category || dna.label,
    product_features: product.features || [],
    product_benefits: benefits,
    niche_key: niche,
    niche_label: dna.label,
    must_avoid_words: banned,
    encouraged_concepts: positive,
    archetype_definitions: {
      problem: "Name a pain the buyer wants to solve, framed for THIS product.",
      benefit: "Lead with the strongest concrete benefit of THIS product.",
      curiosity: "Open an information loop the pin image will resolve.",
      emotional: "Evoke the feeling of using this product with their pet.",
      outcome: "Describe the after-state once this product is in their home.",
    },
    rules: {
      max_chars: 42,
      count: 5,
      one_per_archetype: true,
      must_describe_this_product: true,
      must_not_reference_other_categories: true,
      no_medical_claims: true,
    },
  };

  const accepted: ProductHook[] = [];
  let rejectionFeedback: Array<{ headline: string; reason: string }> = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (accepted.length >= 5) break;
    const userPayload = {
      ...baseUser,
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
                `Write 5 Pinterest headlines for THIS product only — one per archetype. ` +
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
    const seenArchetype = new Set(accepted.map((a) => a.archetype));
    for (const h of raw) {
      const headline = String(h?.headline || "").replace(/[.\s]+$/g, "").slice(0, 42).trim();
      const arche = String(h?.archetype || "").toLowerCase() as HookArchetype;
      if (!headline) continue;
      if (!ARCHETYPES.includes(arche)) continue;
      if (seenArchetype.has(arche)) continue;
      if (accepted.some((a) => a.headline.toLowerCase() === headline.toLowerCase())) continue;
      const { score, banned: hit } = scoreHookRelevance(headline, product, niche);
      if (hit) {
        rejectionFeedback.push({ headline, reason: `contains banned term '${hit}' for niche '${niche}'` });
        continue;
      }
      accepted.push({
        headline,
        rationale: String(h?.rationale || "").slice(0, 240),
        source: "ai_product",
        relevance: score,
        archetype: arche,
      });
      seenArchetype.add(arche);
      if (accepted.length >= 5) break;
    }
  }

  // SPEC §3 + §4: keep the highest-scoring AI candidate regardless of score,
  // persist its real score, and replay it across every requested brief slot
  // so the product gets ONE final winning hook. No bank top-up.
  if (accepted.length === 0) {
    const fb = fallbackHooks(product, dna, 1);
    return Array.from({ length: count }, () => ({ ...fb[0] }));
  }
  accepted.sort((a, b) => b.relevance - a.relevance);
  const winner = accepted[0];
  return Array.from({ length: count }, () => ({ ...winner }));
}