// ─────────────────────────────────────────────────────────────────────────────
// Pinterest pre-publish QA gate
//
// Single source of truth for "is this pin safe to publish?" — used by:
//   • pinterest-viral-batch / pinterest-automation (insert-time validation)
//   • pinterest-cron-worker (last-line-of-defense before posting)
//
// Returns a list of canonical reason codes so the admin UI can render them
// verbatim. Empty list = pin passed QA.
// ─────────────────────────────────────────────────────────────────────────────

/** Reason codes surfaced to admins. Keep stable — the UI maps them 1:1. */
export type PinQaReason =
  | "product_mismatch"
  | "category_mismatch"
  | "bad_crop"
  | "unreadable_text"
  | "unreadable_overlay"
  | "missing_cta"
  | "wrong_destination_url"
  | "allowlist_disabled"
  | "low_resolution"
  | "malformed_url"
  | "spam_payload"
  | "duplicate_asset"
  | "weak_hook"
  | "supplier_image"
  | "white_background";

/** During QA stabilization ONLY this product slug may publish to Pinterest. */
export const PINTEREST_ALLOWED_SLUGS: ReadonlySet<string> = new Set([
  "automatic-cat-litter-box-self-cleaning-app-control",
  // Phase 1 — Controlled Launch (3 premium pins, 24h warm-up)
  "cactus-cat-climbing-tree-all-in-one-condo",
  "hidden-cat-litter-box-furniture-enclosure",
]);

export interface PinQaInput {
  product_slug?: string | null;
  product_name?: string | null;
  pin_title?: string | null;
  pin_description?: string | null;
  pin_image_url?: string | null;
  destination_link?: string | null;
  board_name?: string | null;
  category_key?: string | null;
  overlay_text?: string | null;
  image_hash?: string | null;
  /** Pre-computed: true if image_hash collides with another posted pin in the last 14 days. */
  duplicate_image?: boolean;
  /** When true the single-product allowlist is bypassed (Domination Mode). */
  domination_mode?: boolean;
}

const CAT_PATTERNS = /\b(cat|kitten|kitty|litter\s*box|feline)\b/i;
const DOG_PATTERNS = /\b(dog|puppy|canine|leash|kennel|crate)\b/i;
const FISH_PATTERNS = /\b(fish|aquarium|tank|betta)\b/i;
const BIRD_PATTERNS = /\b(bird|parrot|cage|aviary)\b/i;

function isCatLitterSlug(slug: string): boolean {
  return /litter|cat/i.test(slug);
}
function isDogSlug(slug: string): boolean {
  return /\b(dog|puppy|leash|kennel)\b/i.test(slug);
}

/**
 * Run all QA checks on a pin. Returns the list of failed reason codes.
 * Empty array = pin is safe.
 */
export function runPinQa(pin: PinQaInput): PinQaReason[] {
  const reasons = new Set<PinQaReason>();
  const slug = (pin.product_slug || "").toLowerCase();
  const name = (pin.product_name || "").toLowerCase();
  const title = (pin.pin_title || "").toLowerCase();
  const desc = (pin.pin_description || "").toLowerCase();
  const overlay = (pin.overlay_text || "").toLowerCase();
  const corpus = `${title} ${desc} ${overlay}`;
  const board = (pin.board_name || "").toLowerCase();

  // Lazy-import the hook bank + spam helpers via dynamic require avoidance:
  // We can't `import` here without making the file async, so we inline the
  // minimal regex set instead. The dedicated hook bank is enforced by the
  // generator + a thin call below.
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
  const INVALID_UTF = /[\uFFFD\u0000\uD800-\uDFFF]/;
  const ENCODED_BLOB = /(?:%[0-9A-Fa-f]{2}){12,}|[A-Za-z0-9+/=]{200,}/;
  const isSpammy = (s: string) =>
    INVALID_UTF.test(s) ||
    (s.match(EMOJI) || []).length > 3 ||
    ENCODED_BLOB.test(s);

  // 1. Allowlist (during QA stabilization)
  if (!pin.domination_mode && !PINTEREST_ALLOWED_SLUGS.has(slug)) {
    reasons.add("allowlist_disabled");
  }

  // 2. Destination URL must point to the same product slug
  const dest = pin.destination_link || "";
  if (!slug || !dest || !dest.includes(`/products/${slug}`)) {
    reasons.add("wrong_destination_url");
  }
  try {
    if (dest) {
      const u = new URL(dest);
      if (u.hostname !== "getpawsy.pet" && u.hostname !== "www.getpawsy.pet") {
        reasons.add("malformed_url");
      }
    }
  } catch {
    reasons.add("malformed_url");
  }

  // 3. Product / category cross-contamination checks
  const isCatLitter = isCatLitterSlug(slug) || /litter/i.test(name);
  const isDog = isDogSlug(slug);

  if (isCatLitter) {
    // Cat litter box pin must NOT mention dog/fish/bird products
    if (DOG_PATTERNS.test(corpus) || FISH_PATTERNS.test(corpus) || BIRD_PATTERNS.test(corpus)) {
      reasons.add("product_mismatch");
    }
    if (board && !/cat|litter|smart\s*pet|pet\s*parent|modern\s*cat|automatic|getpawsy/i.test(board)) {
      reasons.add("category_mismatch");
    }
  }

  if (isDog) {
    // Dog pin must not carry cat-litter copy
    if (/litter\s*box/i.test(corpus) || CAT_PATTERNS.test(corpus)) {
      reasons.add("product_mismatch");
    }
  }

  // 4. Image URL sanity (cropping heuristic — Cloudinary fill must be 9:16)
  const img = pin.pin_image_url || "";
  if (!img.startsWith("https://")) {
    reasons.add("bad_crop");
  } else if (img.includes("res.cloudinary.com") && !/w_1080.*h_1920|h_1920.*w_1080/.test(img)) {
    reasons.add("bad_crop");
  }
  // Low-resolution heuristic — Cloudinary URL must request ≥1000×1500.
  if (img.includes("res.cloudinary.com")) {
    const wMatch = img.match(/w_(\d+)/);
    const hMatch = img.match(/h_(\d+)/);
    const w = wMatch ? Number(wMatch[1]) : 0;
    const h = hMatch ? Number(hMatch[1]) : 0;
    if (w && w < 1000) reasons.add("low_resolution");
    if (h && h < 1500) reasons.add("low_resolution");
  }

  // Duplicate asset (passed in by caller after DB lookup)
  if (pin.duplicate_image) reasons.add("duplicate_asset");

  // 4b. Supplier-hosted images are banned (CJ / AliExpress / Dsers / etc.).
  // Pinterest distribution downgrades these and they look like dropshipping.
  if (img) {
    try {
      const host = new URL(img).hostname.toLowerCase();
      if (
        /\b(cjdropshipping|aliexpress|alicdn|dsers|chinabrands|spocket|oberlo)\b/.test(host) ||
        /\b(supplier|dropship)\b/.test(host)
      ) {
        reasons.add("supplier_image");
      }
    } catch {
      // ignore — bad_crop / malformed_url already cover invalid URLs
    }
  }

  // 4c. White-background detection (URL heuristic — we can't fetch pixels in
  // QA). Block Cloudinary URLs that explicitly composite onto solid white,
  // and block obvious supplier "white background" path fragments.
  if (img && /(?:[?&_]b(?:g)?_(?:white|fff|ffffff)|background=(?:white|fff|ffffff)|\/whitebg\/|_whitebg_)/i.test(img)) {
    reasons.add("white_background");
  }

  // 5. Overlay readability — must exist and be reasonable length
  const overlayRaw = pin.overlay_text || "";
  if (!overlayRaw.trim() || overlayRaw.trim().length < 6 || overlayRaw.length > 120) {
    reasons.add("unreadable_text");
    reasons.add("unreadable_overlay");
  }

  // 6. CTA must exist (overlay split format: "TOP | BOTTOM")
  const parts = overlayRaw.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2 || parts[1].length < 2) {
    reasons.add("missing_cta");
  }

  // 7. Spam payload check on every visible string
  for (const s of [pin.pin_title || "", pin.pin_description || "", overlayRaw]) {
    if (s && isSpammy(s)) {
      reasons.add("spam_payload");
      break;
    }
  }

  // 8. Weak / off-script hook — top overlay must be from APPROVED_HOOKS bank.
  // We intentionally re-import here (dynamic) so this file stays sync.
  // The bank is small (~16 strings); an inline copy would be just as good.
  const APPROVED_TOP = [
    // pain
    "tired of litter box chores", "cat litter smell taking over",
    "daily scooping gets old fast", "your cat deserves better",
    "hate scooping every day", "cat smell taking over your home",
    "tired of cat tree wobble", "cluttered apartment cat setup",
    // time_saving
    "clean litter in seconds", "save 30 minutes every week",
    "save 30+ minutes every week", "one tap cleanup",
    "save 20 minutes daily", "cleaner home in seconds", "set it and forget it",
    // transformation
    "from messy to self-cleaning", "upgrade your cat setup",
    "small apartment cat hack", "before vs after cat setup",
    "from cluttered to calm", "apartment cat owner upgrade", "from messy to modern",
    // social_proof
    "thousands of cat owners switched", "cat parents are obsessed with this",
    "viral cat owner upgrade", "smart pet parents love this",
    "cat owners can t stop buying this", "10 000 cat parents agree",
    "10000 cat parents agree",
    // curiosity
    "i wish i bought this sooner", "why are cat owners switching",
    "this changed my cat routine", "wait until you see this",
    "why is nobody talking about this", "cat owners are obsessed",
    "the viral cat gadget of 2026",
    // infographic
    "3 reasons cat owners switch", "why self-cleaning litter goes viral",
    "why self cleaning litter goes viral",
    "5 must-have cat parent essentials", "5 must have cat parent essentials",
    "apartment cat setup checklist", "top 3 smart pet upgrades",
    "what every modern cat parent needs",
  ];
  const top = (parts[0] || overlayRaw).toLowerCase().replace(/[^\w\s]/g, "").trim();
  const matchesApproved = APPROVED_TOP.some((h) => top.startsWith(h) || h.startsWith(top));
  if (top && !matchesApproved) {
    reasons.add("weak_hook");
  }

  return Array.from(reasons);
}

/** Convenience: true if pin passed every QA check. */
export function isPinPublishable(pin: PinQaInput): boolean {
  return runPinQa(pin).length === 0;
}