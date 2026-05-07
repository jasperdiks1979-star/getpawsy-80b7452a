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
  | "curiosity";

export const APPROVED_HOOKS: Record<HookCategory, string[]> = {
  pain: [
    "Tired of litter box chores?",
    "Cat litter smell taking over?",
    "Daily scooping gets old fast",
    "Your cat deserves better",
  ],
  time_saving: [
    "Clean litter in seconds",
    "Save 30+ minutes every week",
    "One tap cleanup",
  ],
  transformation: [
    "From messy to self-cleaning",
    "Upgrade your cat setup",
    "Small apartment cat hack",
  ],
  social_proof: [
    "Thousands of cat owners switched",
    "Cat parents are obsessed with this",
    "Viral cat owner upgrade",
  ],
  curiosity: [
    "I wish I bought this sooner",
    "Why are cat owners switching?",
    "This changed my cat routine",
  ],
};

/** Approved CTA bottom-overlay copy. Short, action-driven, mobile-safe. */
export const APPROVED_CTAS: string[] = [
  "See why",
  "Shop the upgrade",
  "Learn more",
  "End the scoop",
  "Save hours weekly",
];

/** Boards allowed for the hero (cat litter) product. */
export const APPROVED_BOARDS = new Set<string>([
  "Cat Essentials",
  "Smart Cat Products",
  "Smart Pet Gadgets",
  "Cat Care Essentials",
]);

/** SEO target keywords — at least one must appear in title OR description. */
export const TARGET_KEYWORDS: string[] = [
  "self cleaning litter box",
  "automatic litter box",
  "cat owner hacks",
  "cat apartment essentials",
  "smart cat products",
  "odor free litter box",
  "cat cleaning solution",
];

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

/** Stable hash of an image URL — used for duplicate-asset detection. */
export function hashImageUrl(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) - h) + url.charCodeAt(i);
    h |= 0;
  }
  return `img_${(h >>> 0).toString(36)}_${url.length}`;
}