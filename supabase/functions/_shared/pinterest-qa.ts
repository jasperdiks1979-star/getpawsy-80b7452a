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
  | "missing_cta"
  | "wrong_destination_url"
  | "allowlist_disabled";

/** During QA stabilization ONLY this product slug may publish to Pinterest. */
export const PINTEREST_ALLOWED_SLUGS: ReadonlySet<string> = new Set([
  "automatic-cat-litter-box-self-cleaning-app-control",
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

  // 1. Allowlist (during QA stabilization)
  if (!PINTEREST_ALLOWED_SLUGS.has(slug)) {
    reasons.add("allowlist_disabled");
  }

  // 2. Destination URL must point to the same product slug
  const dest = pin.destination_link || "";
  if (!slug || !dest || !dest.includes(`/products/${slug}`)) {
    reasons.add("wrong_destination_url");
  }

  // 3. Product / category cross-contamination checks
  const isCatLitter = isCatLitterSlug(slug) || /litter/i.test(name);
  const isDog = isDogSlug(slug);

  if (isCatLitter) {
    // Cat litter box pin must NOT mention dog/fish/bird products
    if (DOG_PATTERNS.test(corpus) || FISH_PATTERNS.test(corpus) || BIRD_PATTERNS.test(corpus)) {
      reasons.add("product_mismatch");
    }
    if (board && !/cat|litter|smart\s*pet/i.test(board)) {
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

  // 5. Overlay readability — must exist and be reasonable length
  const overlayRaw = pin.overlay_text || "";
  if (!overlayRaw.trim() || overlayRaw.trim().length < 6 || overlayRaw.length > 120) {
    reasons.add("unreadable_text");
  }

  // 6. CTA must exist (overlay split format: "TOP | BOTTOM")
  const parts = overlayRaw.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2 || parts[1].length < 2) {
    reasons.add("missing_cta");
  }

  return Array.from(reasons);
}

/** Convenience: true if pin passed every QA check. */
export function isPinPublishable(pin: PinQaInput): boolean {
  return runPinQa(pin).length === 0;
}