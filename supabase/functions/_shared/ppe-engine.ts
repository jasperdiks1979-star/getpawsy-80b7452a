// Pinterest Psychology Engine — shared reasoning module for PCIE-V2.
// "Would a real American Pinterest user stop scrolling and click?"
// All helpers are pure or take a Supabase client; never throw on observability.

import { cleanProductTitleForPinterest } from "./pinterest-geo-intelligence.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

// ---------- Story Bank (deterministic seed; LLM can enrich on demand) ----------
type StorySeed = {
  story: string;
  primary: string;
  secondary: string;
  response: string;
  motivations: string[];
  customer: { archetype: string; lifestyle: string; pain: string };
  scenes: string[];
};

const STORY_BANK: Record<string, StorySeed> = {
  dog_leash: {
    story: "Saturday morning walk in autumn light — leash clipped, dog pulling toward the door.",
    primary: "adventure", secondary: "trust", response: "I want this for our morning walks",
    motivations: ["safer control", "everyday adventure", "confidence on busy streets"],
    customer: { archetype: "Active US dog parent", lifestyle: "Walks daily, weekend hikes", pain: "Flimsy leashes that fail" },
    scenes: ["Owner clipping leash before leaving", "Trail walk through autumn leaves", "Sidewalk in soft morning sun"],
  },
  cat_toy: {
    story: "Curious indoor cat mid-pounce, eyes locked on the toy.",
    primary: "curiosity", secondary: "playfulness", response: "My cat would love this",
    motivations: ["indoor enrichment", "burn off energy", "bonding moments"],
    customer: { archetype: "Indoor cat parent", lifestyle: "Works from home, small apartment", pain: "Bored cat at 6am" },
    scenes: ["Cat mid-leap on rug", "Toy mid-flight against sunlit wall", "Cat resting paw on toy"],
  },
  cat_litter: {
    story: "A modern hallway — litter box quietly tucked beside the entry, no smell, no mess.",
    primary: "relief", secondary: "luxury", response: "I want my home to look like this",
    motivations: ["less daily scooping", "odor-free home", "apartment-friendly footprint"],
    customer: { archetype: "Modern US apartment cat parent", lifestyle: "Hosts friends, hates litter mess", pain: "Constant scooping & smell" },
    scenes: ["Entryway with hidden litter box", "Owner walking past, cat using it", "Clean white tile, fresh light"],
  },
  cat_fountain: {
    story: "Cat drinking from a softly bubbling fountain in a quiet kitchen morning.",
    primary: "trust", secondary: "comfort", response: "Healthier hydration for my cat",
    motivations: ["healthy hydration", "peace of mind", "quiet modern home"],
    customer: { archetype: "Health-aware cat parent", lifestyle: "Reads labels, premium home", pain: "Cat won't drink enough water" },
    scenes: ["Cat lapping water in morning light", "Fountain on marble counter", "Close-up of paw at the rim"],
  },
  cat_tree: {
    story: "Cat napping on the highest perch of a stylish tree by the living-room window.",
    primary: "comfort", secondary: "pride", response: "This would look great in our living room",
    motivations: ["save furniture", "give the cat its own space", "blend with decor"],
    customer: { archetype: "Design-aware cat parent", lifestyle: "Curates home, multiple cats", pain: "Ugly cat towers ruin the room" },
    scenes: ["Cat lounging on top perch", "Owner reading, cat watching from tree", "Sunlit modern living room scene"],
  },
  cat_bed: {
    story: "Cat curled into a soft bed near a sunlit window, breathing slowly.",
    primary: "comfort", secondary: "love", response: "I'd buy this for my cat tonight",
    motivations: ["a spot they actually use", "soft and washable", "looks at home"],
    customer: { archetype: "Nurturing cat parent", lifestyle: "Cozy home, weekend lounger", pain: "Cat ignores the beds we buy" },
    scenes: ["Cat asleep, paw covering nose", "Owner gently petting from above", "Bed at window with morning light"],
  },
  dog_bed: {
    story: "Big dog stretched out on a supportive bed at the foot of the couch, snoring.",
    primary: "comfort", secondary: "love", response: "My old dog needs this",
    motivations: ["joint support", "looks nice in the room", "easy to clean"],
    customer: { archetype: "Family dog parent", lifestyle: "Senior or large dog, busy household", pain: "Dog sleeps on the cold floor" },
    scenes: ["Dog asleep, deep relaxation", "Owner sitting on couch, dog at feet", "Living room evening light"],
  },
  interactive_toy: {
    story: "Smart pet engaged with a puzzle toy while owner makes coffee.",
    primary: "curiosity", secondary: "joy", response: "This would keep them busy",
    motivations: ["mental stimulation", "less destructive boredom", "quiet mornings"],
    customer: { archetype: "Busy pet parent", lifestyle: "WFH or full-day office", pain: "Bored pet destroys things" },
    scenes: ["Pet focused on toy on a wood floor", "Owner watching with coffee", "Soft kitchen morning light"],
  },
  feeder: {
    story: "Automatic feeder on a clean counter — pet waiting calmly at the bowl.",
    primary: "convenience", secondary: "trust", response: "This would make my life easier",
    motivations: ["never miss a meal", "weight control", "travel & long workdays"],
    customer: { archetype: "Working pet parent", lifestyle: "Long hours, occasional travel", pain: "Guilt over feeding schedule" },
    scenes: ["Feeder dispensing into bowl", "Pet waiting calmly", "Modern kitchen, sun through window"],
  },
  grooming: {
    story: "Calm grooming moment — coat smooth, hair collected, pet visibly relaxed.",
    primary: "calm", secondary: "love", response: "This would save me at home",
    motivations: ["less shedding", "calm routine", "save on groomer visits"],
    customer: { archetype: "Practical pet parent", lifestyle: "Hates fur on furniture", pain: "Fur everywhere all the time" },
    scenes: ["Owner gently brushing pet", "Coat catching light, no flying hair", "Calm pet half-asleep"],
  },
  dog_harness: {
    story: "Hike-ready harness clipped on, dog leaning toward the trail.",
    primary: "adventure", secondary: "safety", response: "Great fit for our weekend hikes",
    motivations: ["safer walks", "comfortable fit", "trail-ready"],
    customer: { archetype: "Outdoor dog parent", lifestyle: "Weekend hikes, daily walks", pain: "Harness chafes or slips" },
    scenes: ["Owner clipping harness on porch", "Dog on trail in golden hour", "Close-up of harness on dog mid-walk"],
  },
  calming_bed: {
    story: "Anxious dog finally settled in a deep, fluffy calming bed.",
    primary: "relief", secondary: "comfort", response: "Maybe this helps my anxious dog",
    motivations: ["calmer evenings", "fewer accidents", "deeper sleep"],
    customer: { archetype: "Anxious-dog parent", lifestyle: "Quiet home, routine focused", pain: "Restless, pacing dog at night" },
    scenes: ["Dog burrowed nose-in", "Owner reading nearby", "Warm lamp light"],
  },
  generic_pet: {
    story: "A real moment — pet using the product naturally in a real US home.",
    primary: "joy", secondary: "comfort", response: "I'd buy this for my pet",
    motivations: ["solve a daily problem", "fits my home", "pet seems happier"],
    customer: { archetype: "Everyday US pet parent", lifestyle: "Apartment or family home", pain: "Daily small frustrations" },
    scenes: ["Pet engaging with product naturally", "Owner watching with a smile", "Warm interior morning light"],
  },
};

export function detectNicheKey(input: string | null | undefined): keyof typeof STORY_BANK {
  const t = (input || "").toLowerCase();
  if (/leash|lead/.test(t)) return "dog_leash";
  if (/harness/.test(t)) return "dog_harness";
  if (/calming.*bed|anxiety.*bed/.test(t)) return "calming_bed";
  if (/litter/.test(t)) return "cat_litter";
  if (/fountain|water dispenser/.test(t)) return "cat_fountain";
  if (/cat\s*tree|cat\s*tower|scratch/.test(t)) return "cat_tree";
  if (/cat.*bed/.test(t)) return "cat_bed";
  if (/cat.*toy|wand|teaser|tunnel/.test(t)) return "cat_toy";
  if (/dog.*bed|orthopedic/.test(t)) return "dog_bed";
  if (/puzzle|interactive|smart\s*toy/.test(t)) return "interactive_toy";
  if (/feeder/.test(t)) return "feeder";
  if (/groom|brush|deshedd/.test(t)) return "grooming";
  return "generic_pet";
}

export function buildStoryProfile(opts: { niche?: string | null; title?: string | null; slug?: string | null }) {
  const key = detectNicheKey([opts.niche, opts.title, opts.slug].filter(Boolean).join(" "));
  const seed = STORY_BANK[key] ?? STORY_BANK.generic_pet;
  return {
    niche_key: key,
    story: seed.story,
    primary_emotion: seed.primary,
    secondary_emotion: seed.secondary,
    desired_response: seed.response,
    buying_motivations: seed.motivations,
    target_customer: seed.customer,
    scene_suggestions: seed.scenes,
  };
}

// ---------- Badge rotation ----------
export async function pickRotatingBadge(supabase: any): Promise<{ id: string; text: string } | null> {
  // Pick a least-recently-used enabled badge.
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString();
  const { data: badges } = await supabase
    .from("ppe_brand_badges").select("id,text").eq("enabled", true);
  if (!badges?.length) return null;
  const { data: recent } = await supabase
    .from("ppe_badge_usage").select("badge_id,used_at").gte("used_at", since);
  const usage = new Map<string, number>();
  for (const r of recent ?? []) usage.set(r.badge_id, (usage.get(r.badge_id) ?? 0) + 1);
  badges.sort((a: any, b: any) => (usage.get(a.id) ?? 0) - (usage.get(b.id) ?? 0));
  // Pick from the top quintile randomly to avoid lockstep cycling.
  const head = badges.slice(0, Math.max(3, Math.floor(badges.length * 0.2)));
  return head[Math.floor(Math.random() * head.length)];
}

// ---------- Title rewrite ----------
export function rewriteSupplierTitle(raw: string | null | undefined, fallbackNiche?: string): string {
  return cleanProductTitleForPinterest(raw, fallbackNiche?.replace(/_/g, " "));
}

// ---------- Attention map (deterministic heuristic) ----------
export function buildAttentionMap(input: { hookLen: number; productHero: boolean; hasBadge: boolean; hasCta: boolean }) {
  const order: { rank: number; target: string; weight: number }[] = [];
  // Desired sequence: Product -> Animal -> Emotion -> Brand -> CTA.
  // Weights penalize missing product hero or missing CTA, etc.
  const productWeight = input.productHero ? 100 : 60;
  order.push({ rank: 1, target: "product", weight: productWeight });
  order.push({ rank: 2, target: "animal", weight: 90 });
  order.push({ rank: 3, target: "emotion", weight: 78 });
  order.push({ rank: 4, target: "brand", weight: input.hasBadge ? 72 : 40 });
  order.push({ rank: 5, target: "cta", weight: input.hasCta ? 68 : 30 });
  const balance = Math.round((productWeight + (input.hasBadge ? 72 : 40) + (input.hasCta ? 68 : 30)) / 3);
  return { order, balance };
}

// ---------- LLM-backed candidate prediction ----------
const PREDICT_MODEL = "google/gemini-3-flash-preview";

export async function predictCandidate(input: {
  product: { title: string; niche: string; slug?: string };
  decisions: Record<string, string>;
  story: string;
  primary_emotion: string;
  hook: string;
  cta: string;
  badge: string | null;
  prompt: string;
}): Promise<{
  scores: Record<string, number>;
  reasons: string;
  competitor_verdict: "wins" | "ties" | "loses";
  would_click: boolean;
  improvements: string[];
}> {
  const sys = [
    "You are an experienced Pinterest Creative Director, Consumer Psychologist and Conversion Optimizer working for a US pet brand.",
    "You evaluate a proposed Pinterest pin CONCEPT (story, emotion, hook, composition, prompt, badge, CTA) before render.",
    "Score 0-100 on every axis from the perspective of a real American Pinterest user who has never heard of the brand.",
    "Be honest, not generous. Reject beauty over function.",
    "Return STRICT JSON only: {\"scores\":{\"ctr_prediction\":n,\"save_prediction\":n,\"purchase_prediction\":n,\"product_visibility\":n,\"scroll_stop\":n,\"novelty\":n,\"us_relevance\":n},\"competitor_verdict\":\"wins|ties|loses\",\"would_click\":bool,\"reasons\":\"...\",\"improvements\":[\"...\"]}",
  ].join(" ");
  const user = JSON.stringify({
    product: input.product,
    decisions: input.decisions,
    story: input.story,
    primary_emotion: input.primary_emotion,
    hook: input.hook,
    cta: input.cta,
    badge: input.badge,
    prompt_excerpt: input.prompt.slice(0, 900),
    competitor_baseline: ["Amazon", "Chewy", "Temu", "Etsy", "CJ supplier"],
  });
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: PREDICT_MODEL,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`predict_${res.status}`);
    const j = await res.json();
    const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
    return {
      scores: parsed.scores ?? {},
      reasons: parsed.reasons ?? "",
      competitor_verdict: parsed.competitor_verdict ?? "ties",
      would_click: !!parsed.would_click,
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
    };
  } catch {
    // Deterministic fallback so the pipeline keeps moving offline.
    return {
      scores: {
        ctr_prediction: 70, save_prediction: 70, purchase_prediction: 60,
        product_visibility: 70, scroll_stop: 70, novelty: 70, us_relevance: 75,
      },
      reasons: "fallback (predict_offline)", competitor_verdict: "ties",
      would_click: false, improvements: ["LLM predict unavailable"],
    };
  }
}

export function compositePpeScore(scores: Record<string, number>): number {
  const w = {
    ctr_prediction: 0.22, scroll_stop: 0.18, product_visibility: 0.20,
    save_prediction: 0.10, purchase_prediction: 0.12, novelty: 0.08, us_relevance: 0.10,
  } as Record<string, number>;
  let s = 0;
  for (const k in w) s += w[k] * Number(scores[k] ?? 50);
  return Math.round(s);
}

export function ppeFloors(cfg: Record<string, any>) {
  return {
    visibility: Number(cfg.ppe_visibility_floor ?? 95),
    ctr: Number(cfg.ppe_ctr_floor ?? 95),
    novelty: Number(cfg.ppe_novelty_floor ?? 96),
    composite: Number(cfg.ppe_composite_floor ?? 92),
  };
}