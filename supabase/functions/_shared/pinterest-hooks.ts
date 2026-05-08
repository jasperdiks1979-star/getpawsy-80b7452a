// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Performance Mode — Approved Hook Bank
//
// Single source of truth for hook copy. The viral batch generator MUST pick
// from these lists, and the QA gate refuses to publish any pin whose title
// or top overlay is not a member (or a close prefix) of the bank.
//
// Categories are taken verbatim from the GetPawsy Pinterest Performance Mode
// brief: PAIN / TIME-SAVING / TRANSFORMATION / SOCIAL-PROOF / CURIOSITY.
// ─────────────────────────────────────────────────────────────────────────────

export type HookCategory =
  | "pain"
  | "time_saving"
  | "transformation"
  | "social_proof"
  | "curiosity"
  | "infographic";

export const APPROVED_HOOKS: Record<HookCategory, string[]> = {
  pain: [
    "Tired of litter box chores?",
    "Cat litter smell taking over?",
    "Daily scooping gets old fast",
    "Your cat deserves better",
    "Hate scooping every day?",
    "Cat smell taking over your home?",
    "Tired of cat tree wobble?",
    "Cluttered apartment cat setup?",
    "My apartment finally stopped smelling",
    "The scoop routine had to go",
    "Litter dust everywhere — done",
  ],
  time_saving: [
    "Clean litter in seconds",
    "Save 30+ minutes every week",
    "One tap cleanup",
    "Save 20 minutes daily",
    "Cleaner home in seconds",
    "Set it and forget it",
    "This changed our daily routine",
    "Hands-free for the first time",
  ],
  transformation: [
    "From messy to self-cleaning",
    "Upgrade your cat setup",
    "Small apartment cat hack",
    "Before vs after cat setup",
    "From cluttered to calm",
    "Apartment cat owner upgrade",
    "From messy to modern",
    "Our apartment looks calmer already",
    "From dust storm to fresh air",
  ],
  social_proof: [
    "Thousands of cat owners switched",
    "Cat parents are obsessed with this",
    "Viral cat owner upgrade",
    "Smart pet parents love this",
    "Cat owners can't stop buying this",
    "10,000+ cat parents agree",
    "Cat owners are obsessed with this",
    "Why is every cat parent buying this?",
  ],
  curiosity: [
    "I wish I bought this sooner",
    "Why are cat owners switching?",
    "This changed my cat routine",
    "Wait until you see this",
    "Why is nobody talking about this?",
    "Cat owners are obsessed",
    "The viral cat gadget of 2026",
    "The litter upgrade nobody talks about",
    "Cat owners are quietly upgrading",
    "The pet hack going around",
  ],
  infographic: [
    "3 reasons cat owners switch",
    "Why self-cleaning litter goes viral",
    "5 must-have cat parent essentials",
    "Apartment cat setup checklist",
    "Top 3 smart pet upgrades",
    "What every modern cat parent needs",
    "3 signs you need a litter upgrade",
    "5 things calm cat parents own",
  ],
};

/** Approved CTA bottom-overlay copy. Short, action-driven, mobile-safe. */
export const APPROVED_CTAS: string[] = [
  "See why",
  "Shop the upgrade",
  "Learn more",
  "End the scoop",
  "Save hours weekly",
  "Discover more",
  "See it in action",
  "Shop now",
  "Explore the setup",
  "See the transformation",
  "Discover why",
  "See the setup",
  "Explore the trend",
  "Shop the viral find",
];

/** Boards approved for organic publishing across all GetPawsy categories. */
export const APPROVED_BOARDS = new Set<string>([
  "Cat Essentials",
  "Smart Cat Products",
  "Smart Pet Gadgets",
  "Cat Care Essentials",
  "Modern Cat Home",
  "Cat Trees for Large Cats",
  "Automatic Litter Solutions",
  "Pet Parent Hacks",
  "Cat Owner Essentials",
  "GetPawsy Products",
]);

/**
 * SEO target keywords per product category. At least one keyword from the
 * matched category (or `default` fallback) must appear in title OR description.
 */
export const TARGET_KEYWORDS_BY_CATEGORY: Record<string, string[]> = {
  "cat-litter": [
    "self cleaning litter box",
    "automatic litter box",
    "smart litter box",
    "odor free litter box",
    "cat hygiene",
    "app controlled litter box",
  ],
  "cat-tree": [
    "cat tree",
    "large cat tree",
    "modern cat tree",
    "indoor cat setup",
    "apartment cat furniture",
    "cat climbing tower",
  ],
  "cat-furniture": [
    "hidden litter box furniture",
    "modern cat furniture",
    "apartment cat essentials",
    "cat home decor",
  ],
  "smart-pet-gadget": [
    "smart pet gadget",
    "automatic pet feeder",
    "modern pet tech",
    "smart home pet setup",
  ],
  "dog-bed": [
    "orthopedic dog bed",
    "memory foam dog bed",
    "calming dog bed",
    "large dog bed",
  ],
  default: [
    "cat owner essentials",
    "smart pet products",
    "modern pet parent",
    "pet parent hacks",
  ],
};

/** Back-compat alias — older callers expect a flat list. */
export const TARGET_KEYWORDS: string[] = Array.from(
  new Set(Object.values(TARGET_KEYWORDS_BY_CATEGORY).flat()),
);

/**
 * Map a free-form product category/slug to one of our keyword buckets.
 * Unknown categories fall through to `default`.
 */
export function resolveCategoryKey(
  raw: string | null | undefined,
  slug?: string | null,
): keyof typeof TARGET_KEYWORDS_BY_CATEGORY {
  const c = `${raw || ""} ${slug || ""}`.toLowerCase();
  if (/litter\s*box|self[-\s]?cleaning/.test(c)) return "cat-litter";
  if (/cat\s*tree|cat\s*tower|cat\s*condo|climbing/.test(c)) return "cat-tree";
  if (/(hidden|enclosure|cabinet).*(litter|cat)|cat\s*furniture/.test(c)) return "cat-furniture";
  if (/feeder|fountain|smart\s*pet|gadget/.test(c)) return "smart-pet-gadget";
  if (/dog\s*bed|orthopedic|memory\s*foam/.test(c)) return "dog-bed";
  return "default";
}

/** Style → preferred Pinterest board fallbacks (used when board affinity table is empty). */
export const STYLE_TO_BOARD_FALLBACK: Record<string, string[]> = {
  pain:           ["Pet Parent Hacks", "Cat Care Essentials", "Smart Pet Gadgets"],
  time_saving:   ["Smart Pet Gadgets", "Automatic Litter Solutions", "Pet Parent Hacks"],
  transformation: ["Modern Cat Home", "Cat Owner Essentials", "Smart Pet Gadgets"],
  social_proof:   ["Smart Pet Gadgets", "Cat Care Essentials", "GetPawsy Products"],
  curiosity:      ["Smart Pet Gadgets", "Pet Parent Hacks", "GetPawsy Products"],
  infographic:    ["Cat Care Essentials", "Pet Parent Hacks", "Modern Cat Home"],
};

function normalize(s: string): string {
  return (s || "").toLowerCase().replace(/[\s\p{P}]+/gu, " ").trim();
}

const ALL_HOOK_NORMALIZED: Set<string> = new Set(
  Object.values(APPROVED_HOOKS).flat().map(normalize),
);
const ALL_CTA_NORMALIZED: Set<string> = new Set(APPROVED_CTAS.map(normalize));

/** Pick a deterministic hook from a category (uses index modulo). */
export function pickHook(category: HookCategory, seed: number): string {
  const list = APPROVED_HOOKS[category];
  return list[Math.abs(seed) % list.length];
}

/** Pick a deterministic CTA. */
export function pickCta(seed: number): string {
  return APPROVED_CTAS[Math.abs(seed) % APPROVED_CTAS.length];
}

/** True if `text` matches an approved hook (normalized, prefix-tolerant). */
export function isApprovedHook(text: string | null | undefined): boolean {
  const n = normalize(text || "");
  if (!n) return false;
  if (ALL_HOOK_NORMALIZED.has(n)) return true;
  for (const h of ALL_HOOK_NORMALIZED) {
    if (n.startsWith(h) || h.startsWith(n)) return true;
  }
  return false;
}

/** True if `text` matches an approved CTA (normalized, prefix-tolerant). */
export function isApprovedCta(text: string | null | undefined): boolean {
  const n = normalize(text || "");
  if (!n) return false;
  if (ALL_CTA_NORMALIZED.has(n)) return true;
  for (const c of ALL_CTA_NORMALIZED) {
    if (n.startsWith(c) || c.startsWith(n)) return true;
  }
  return false;
}

/** True if title or description contains at least one target SEO keyword. */
export function containsTargetKeyword(...fields: Array<string | null | undefined>): boolean {
  const corpus = fields.map((f) => (f || "").toLowerCase()).join(" ");
  return TARGET_KEYWORDS.some((k) => corpus.includes(k));
}

/** True if any keyword from the resolved category bucket is present. */
export function containsCategoryKeyword(
  categoryKey: keyof typeof TARGET_KEYWORDS_BY_CATEGORY,
  ...fields: Array<string | null | undefined>
): boolean {
  const corpus = fields.map((f) => (f || "").toLowerCase()).join(" ");
  const bucket = TARGET_KEYWORDS_BY_CATEGORY[categoryKey] || TARGET_KEYWORDS_BY_CATEGORY.default;
  return bucket.some((k) => corpus.includes(k));
}

/** Stable hash of an image URL — used for duplicate-asset detection. */
export function hashImageUrl(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) - h) + url.charCodeAt(i);
    h |= 0;
  }
  return `img_${(h >>> 0).toString(36)}_${url.length}`;
}