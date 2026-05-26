// Pinterest video metadata generator — product-aware, category-tuned, A/B-variant aware.
// All copy is generated dynamically from product data. No litterbox-specific fallbacks.
import type { VideoHook } from "./pinterest-video-hooks.ts";

// Banned terms (mirror of src/config/merchant-policy.ts BANNED_TERMS + ad-risk phrases)
const BANNED = [
  "vet approved","vet-approved","veterinarian","clinically proven","clinically tested",
  "scientifically proven","cures","heals","fda approved","medical grade","prescription",
  "doctor recommended","guaranteed","overnight","next day delivery","same day",
  "viral","trending now","limited time","act now","selling fast","only today",
  "best ever","#1","number one","miracle","cheapest","lowest price","100%","sale ends",
];

export function scrubBanned(text: string): string {
  let out = text;
  for (const t of BANNED) {
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    out = out.replace(re, "");
  }
  // Strip ALL CAPS words (>3 letters), excessive emoji, double spaces.
  out = out.replace(/\b[A-Z]{4,}\b/g, (m) => m[0] + m.slice(1).toLowerCase());
  out = out.replace(/([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])\1+/gu, "$1");
  return out.replace(/\s{2,}/g, " ").trim();
}

// ── Category detection ─────────────────────────────────────────────
export type Category =
  | "cat_litter" | "catio" | "cat_tree" | "cat_other"
  | "dog_bed" | "dog_travel" | "dog_other"
  | "pet_tech" | "toy" | "generic";

export function detectCategory(p: { slug?: string; name?: string; category?: string; tags?: string[] }): Category {
  const hay = [p.slug, p.name, p.category, ...(p.tags || [])].filter(Boolean).join(" ").toLowerCase();
  if (/litter\s*box|self.?cleaning.*litter|automatic.*litter/.test(hay)) return "cat_litter";
  if (/catio|cat.*enclosure|outdoor.*cat/.test(hay)) return "catio";
  if (/cat.?tree|cat.?condo|cat.?tower|scratch.*post/.test(hay)) return "cat_tree";
  if (/orthopedic.*bed|dog.?bed|pet.?cot|cooling.?bed/.test(hay)) return "dog_bed";
  if (/stroller|carrier|backpack|car.?seat|travel/.test(hay)) return "dog_travel";
  if (/smart|app.?control|wifi|automatic|sensor|camera|feeder/.test(hay)) return "pet_tech";
  if (/toy|chew|ball|puzzle|interactive/.test(hay)) return "toy";
  if (/\bcat\b/.test(hay)) return "cat_other";
  if (/\bdog\b/.test(hay)) return "dog_other";
  return "generic";
}

// ── Category tone profiles (US-market keywords + benefit angles) ────
interface ToneProfile {
  // 5 dynamic title templates; {product} replaced with short product noun, {hook} optional emotional opener
  titles: string[];
  // 5 dynamic descriptions
  descriptions: string[];
  // CTA pool
  ctas: string[];
  // Hashtag pool (US-friendly)
  hashtags: string[];
  // Short noun for {product} substitution when no product name available
  fallbackNoun: string;
}

const TONES: Record<Category, ToneProfile> = {
  cat_litter: {
    titles: [
      "{product} for a Cleaner, Calmer Home",
      "Hands-Free {product} for Busy Cat Owners",
      "{product} with App Control",
      "Less Scooping. More Time With Your Cat.",
      "A Smarter {product} for Indoor Cats",
    ],
    descriptions: [
      "An app-controlled {product} that runs daily cycles so your home stays fresher between full litter changes.",
      "Designed for indoor cat households that want a simpler, hands-off litter routine.",
      "Monitor cycles from your phone and spend less time on daily maintenance.",
      "Built for multi-cat homes — quieter routine, fresher space, easier care.",
      "A modern {product} that makes daily cat care feel lighter.",
    ],
    ctas: ["Shop on GetPawsy", "See how it works", "Tap to explore", "View details"],
    hashtags: ["#catlitterbox","#smartlitterbox","#indoorcat","#catparent","#cathome","#catowner","#getpawsy"],
    fallbackNoun: "self-cleaning litter box",
  },
  catio: {
    titles: [
      "{product} for Safe Outdoor Time",
      "Give Your Cat the Outdoors — Safely",
      "{product} Built for Curious Cats",
      "Outdoor Enrichment for Indoor Cats",
      "A {product} Your Cat Will Actually Use",
    ],
    descriptions: [
      "A secure outdoor space that lets your cat explore fresh air, sunshine and stimulation — without the risks of free roaming.",
      "Multi-level perches, sturdy frame, and weather-ready materials make this {product} an everyday enrichment spot.",
      "Designed for cat parents who want safe outdoor enrichment for indoor cats.",
      "More room to climb, watch and relax — built to last through real weather.",
      "A practical way to give indoor cats real outdoor stimulation, safely.",
    ],
    ctas: ["Shop on GetPawsy", "See the build", "View details", "Tap to explore"],
    hashtags: ["#catio","#outdoorcat","#indoorcat","#catlife","#catparent","#cathome","#getpawsy"],
    fallbackNoun: "outdoor catio",
  },
  cat_tree: {
    titles: [
      "{product} for Climbing, Scratching, Lounging",
      "A {product} That Actually Fits Your Home",
      "{product} Built for Active Indoor Cats",
      "Give Your Cat Their Own Vertical Space",
      "{product} for Multi-Cat Households",
    ],
    descriptions: [
      "A sturdy {product} with multiple perches, sisal posts, and cozy lounging spots for active indoor cats.",
      "Designed to channel scratching and climbing into one durable, attractive piece.",
      "Great for multi-cat homes that need shared vertical space.",
      "Stable base, soft platforms, and natural scratching surfaces in one setup.",
      "An everyday play and rest spot your cats will actually use.",
    ],
    ctas: ["Shop on GetPawsy", "See it on GetPawsy", "View details", "Tap to explore"],
    hashtags: ["#cattree","#catfurniture","#indoorcat","#catparent","#scratchingpost","#catlife","#getpawsy"],
    fallbackNoun: "cat tree",
  },
  cat_other: {
    titles: [
      "{product} for Everyday Cat Care",
      "A Thoughtful {product} for Indoor Cats",
      "{product} Built With Real Cats in Mind",
      "Simple, Practical {product}",
      "{product} for Calmer Cat Routines",
    ],
    descriptions: [
      "A practical {product} designed around real indoor cat households.",
      "Built for everyday use, easy maintenance, and long-term comfort.",
      "Made for cat parents who want quality essentials without the fuss.",
      "Designed to fit naturally into your space and your cat's routine.",
      "A reliable {product} for modern cat homes.",
    ],
    ctas: ["Shop on GetPawsy", "View details", "Tap to explore", "See it on GetPawsy"],
    hashtags: ["#catparent","#indoorcat","#catlife","#cathome","#catowner","#getpawsy"],
    fallbackNoun: "cat essential",
  },
  dog_bed: {
    titles: [
      "{product} for Calmer, Deeper Sleep",
      "Supportive {product} for Aging Joints",
      "{product} for Large & Senior Dogs",
      "A {product} Your Dog Will Sink Into",
      "Comfort-First {product} for Daily Rest",
    ],
    descriptions: [
      "A supportive {product} designed to ease pressure on hips and joints for restful, calmer sleep.",
      "Built with comfort-first materials for dogs that need a real daily resting spot.",
      "Great for senior, large, or recovery-stage dogs that benefit from extra support.",
      "Bolstered edges and a plush surface make this {product} a true everyday favorite.",
      "Designed for calmer routines, deeper rest, and easier mornings.",
    ],
    ctas: ["Shop on GetPawsy", "See it on GetPawsy", "View details", "Tap to explore"],
    hashtags: ["#dogbed","#orthopedicdogbed","#dogparent","#seniordog","#dogcomfort","#doglife","#getpawsy"],
    fallbackNoun: "orthopedic dog bed",
  },
  dog_travel: {
    titles: [
      "{product} for Stress-Free Trips",
      "Travel-Ready {product} for Your Dog",
      "{product} Built for Real-World Adventures",
      "A {product} That Travels As Much As You Do",
      "Comfortable, Secure {product}",
    ],
    descriptions: [
      "A travel-ready {product} designed for road trips, errands, and everyday outings with your dog.",
      "Lightweight frame, mesh ventilation, and secure design for stress-free trips.",
      "Made for dog parents who travel often and want a reliable everyday option.",
      "Comfortable for your dog, easy for you to carry, fold, and load.",
      "Practical, durable, and built for real-world use.",
    ],
    ctas: ["Shop on GetPawsy", "View details", "Tap to explore", "See it on GetPawsy"],
    hashtags: ["#dogstroller","#dogcarrier","#dogtravel","#dogparent","#doglife","#smalldog","#getpawsy"],
    fallbackNoun: "pet carrier",
  },
  dog_other: {
    titles: [
      "{product} for Everyday Dog Care",
      "A Practical {product} for Real Dogs",
      "{product} Built for Daily Use",
      "Simple, Reliable {product}",
      "{product} for Calmer Daily Routines",
    ],
    descriptions: [
      "A practical {product} built around real dog households.",
      "Designed for everyday use, easy maintenance, and long-term comfort.",
      "Made for dog parents who want quality essentials without the fuss.",
      "Built to fit naturally into your routines and your dog's day.",
      "A reliable {product} for modern dog homes.",
    ],
    ctas: ["Shop on GetPawsy", "View details", "Tap to explore", "See it on GetPawsy"],
    hashtags: ["#dogparent","#doglife","#doghome","#dogowner","#dogs","#getpawsy"],
    fallbackNoun: "dog essential",
  },
  pet_tech: {
    titles: [
      "Smart {product} for Modern Pet Homes",
      "{product} You Can Control From Your Phone",
      "Pet Tech That Makes Daily Care Easier",
      "{product} for a Smarter Routine",
      "App-Controlled {product} for Everyday Use",
    ],
    descriptions: [
      "A smart {product} that fits into your routine and your phone, designed for modern pet homes.",
      "App control, smart sensors, and automatic cycles make daily pet care simpler.",
      "Built for busy households that want fewer manual steps and more peace of mind.",
      "Designed around real-life pet care — not just hardware specs.",
      "Pet tech that quietly works in the background so you don't have to think about it.",
    ],
    ctas: ["Shop on GetPawsy", "See how it works", "View details", "Tap to explore"],
    hashtags: ["#smartpet","#pettech","#smarthome","#petparent","#modernpetlife","#getpawsy"],
    fallbackNoun: "smart pet device",
  },
  toy: {
    titles: [
      "{product} for Playful, Engaged Pets",
      "A {product} That Keeps Pets Busy",
      "Interactive {product} for Daily Play",
      "{product} Built for Real Pet Energy",
      "Fun, Durable {product}",
    ],
    descriptions: [
      "An engaging {product} designed to keep your pet active, curious, and entertained.",
      "Built for real play sessions — durable, fun, and easy to clean.",
      "Great for daily enrichment, mental stimulation, and burning off energy.",
      "Designed for pets that need more than the basics.",
      "A reliable everyday play option that holds up to real use.",
    ],
    ctas: ["Shop on GetPawsy", "View details", "Tap to explore", "See it on GetPawsy"],
    hashtags: ["#pettoy","#petplay","#petparent","#enrichment","#petlife","#getpawsy"],
    fallbackNoun: "pet toy",
  },
  generic: {
    titles: [
      "{product} for Everyday Pet Homes",
      "A Thoughtful {product} for Real Pet Owners",
      "{product} Built With Care",
      "Simple, Practical {product}",
      "{product} for Calmer Daily Routines",
    ],
    descriptions: [
      "A practical {product} designed for real pet households.",
      "Built for everyday use, easy maintenance, and long-term comfort.",
      "Made for pet parents who want quality essentials without the fuss.",
      "Designed to fit naturally into your space and routines.",
      "A reliable {product} for modern pet homes.",
    ],
    ctas: ["Shop on GetPawsy", "View details", "Tap to explore", "See it on GetPawsy"],
    hashtags: ["#petparent","#petlife","#pethome","#pets","#getpawsy"],
    fallbackNoun: "pet essential",
  },
};

// ── Helpers ───────────────────────────────────────────────────────
function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % Math.max(arr.length, 1)];
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function buildVariationHash(parts: { title: string; description: string; hashtags: string[] }): string {
  return String(hashSeed([parts.title, parts.description, parts.hashtags.join(",")].join("|")));
}

// Extract a Pinterest-friendly short product noun from a long product name.
// Strips "GetPawsy", "–"-suffixes, marketing tail, length caps at ~55 chars.
export function shortProductNoun(name: string | null | undefined, fallback: string): string {
  if (!name) return fallback;
  let n = name.replace(/^GetPawsy\s*/i, "").trim();
  // Cut at first em/en dash to drop marketing tagline tail.
  n = n.split(/\s+[–—-]\s+/)[0].trim();
  // Drop trailing parens like (2024), sizes, etc.
  n = n.replace(/\s*\(.*?\)\s*$/g, "").trim();
  if (n.length > 55) n = n.slice(0, 55).replace(/\s+\S*$/, "") + "…";
  return n || fallback;
}

export interface ProductContext {
  slug?: string | null;
  name?: string | null;
  category?: string | null;
  tags?: string[] | null;
  benefit_angle?: string | null;
  primary_keyword?: string | null;
}

export interface VideoMeta {
  title: string;
  description: string;
  hashtags: string[];
  cta_text: string;
  variation_hash: string;
  // A/B tracking
  hook_variant: string;     // VideoHook
  copy_variant: string;     // "title{i}/desc{j}"
  cta_variant: string;      // CTA text identifier
  category: Category;
}

export function generateVideoMeta(opts: {
  asset_id: string;
  hook: VideoHook;
  attempt: number;
  product?: ProductContext;
}): VideoMeta {
  const product = opts.product || {};
  const category = detectCategory({
    slug: product.slug ?? undefined,
    name: product.name ?? undefined,
    category: product.category ?? undefined,
    tags: product.tags ?? undefined,
  });
  const tone = TONES[category];
  const noun = shortProductNoun(product.name, tone.fallbackNoun);

  const seed = hashSeed(`${opts.asset_id}:${opts.attempt}:${opts.hook}`);
  const titleIdx = Math.abs(seed) % tone.titles.length;
  const descIdx = Math.abs(seed >> 5) % tone.descriptions.length;
  const ctaIdx = Math.abs(seed >> 11) % tone.ctas.length;

  const titleRaw = tone.titles[titleIdx].replaceAll("{product}", noun);
  // Mobile-optimized: keep titles under 100 chars (Pinterest hard cap) and ideally under 65 for mobile.
  const title = scrubBanned(titleRaw).slice(0, 95);

  const descRaw = tone.descriptions[descIdx].replaceAll("{product}", noun.toLowerCase());
  // Optional benefit angle prefix (from product.benefit_angle) if not duplicative.
  const benefit = (product.benefit_angle || "").trim();
  const description = scrubBanned(
    benefit && !descRaw.toLowerCase().includes(benefit.toLowerCase().slice(0, 12))
      ? `${benefit}. ${descRaw}`
      : descRaw
  ).slice(0, 480);

  // Hashtags: 4–5 from category pool, deterministic rotation.
  const pool = tone.hashtags;
  const start = Math.abs(seed >> 7) % pool.length;
  const hashtags: string[] = [];
  for (let i = 0; i < 5 && i < pool.length; i++) hashtags.push(pool[(start + i) % pool.length]);

  const cta_text = scrubBanned(tone.ctas[ctaIdx]);

  const variation_hash = buildVariationHash({ title, description, hashtags });
  return {
    title, description, hashtags, cta_text, variation_hash,
    hook_variant: opts.hook,
    copy_variant: `t${titleIdx}/d${descIdx}`,
    cta_variant: `c${ctaIdx}`,
    category,
  };
}

// Generate up to N distinct variations for an asset (used by reroll + top-performer cloning).
export function generateNVariations(opts: {
  asset_id: string;
  hook: VideoHook;
  count: number;
  product?: ProductContext;
}): VideoMeta[] {
  const seen = new Set<string>();
  const out: VideoMeta[] = [];
  for (let attempt = 0; attempt < opts.count * 6 && out.length < opts.count; attempt++) {
    const m = generateVideoMeta({ asset_id: opts.asset_id, hook: opts.hook, attempt, product: opts.product });
    if (!seen.has(m.variation_hash)) { seen.add(m.variation_hash); out.push(m); }
  }
  return out;
}

// Build a product-aware destination URL. Falls back to home only when slug truly missing.
export function buildDestinationUrl(slug: string | null | undefined): string {
  const s = (slug || "").trim();
  if (!s) return "https://getpawsy.pet/?utm_source=pinterest&utm_medium=video_pin&utm_campaign=catalog";
  return `https://getpawsy.pet/products/${s}?utm_source=pinterest&utm_medium=video_pin&utm_campaign=${s}`;
}

// Deprecated — kept only to avoid breaking historical imports. Points to home, not litterbox.
export const DEFAULT_DESTINATION_URL = buildDestinationUrl(null);