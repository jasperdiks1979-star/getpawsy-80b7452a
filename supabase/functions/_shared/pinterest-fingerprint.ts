// ─────────────────────────────────────────────────────────────────────────────
// Pinterest creative fingerprint
//
// Deterministic short hash that captures the *creative DNA* of a pin:
//   slug · variant · hook_group · category · overlay (normalized) · backdrop
//
// Two pins with the same fingerprint are creative duplicates even when their
// rendered image URLs differ. Cheaper than perceptual hashing — runs in O(1)
// without downloading the image. Stored on pinterest_pin_queue.creative_fingerprint
// and consulted at insert time to reject near-duplicate creatives.
// ─────────────────────────────────────────────────────────────────────────────

function normalize(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface FingerprintParts {
  product_slug?: string | null;
  pin_variant?: string | null;
  hook_group?: string | null;
  category_key?: string | null;
  overlay_text?: string | null;
  /** Optional structured creative metadata stored under meta.intelligence. */
  backdrop_style?: string | null;
  pin_mode?: string | null;
}

/**
 * Tiny non-crypto hash — FNV-1a 32-bit, hex encoded.
 * Deterministic across Deno/Node so it can also be computed client-side later.
 */
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function computeCreativeFingerprint(parts: FingerprintParts): string {
  const seed = [
    normalize(parts.product_slug),
    normalize(parts.pin_variant),
    normalize(parts.hook_group),
    normalize(parts.category_key),
    normalize(parts.overlay_text),
    normalize(parts.backdrop_style),
    normalize(parts.pin_mode),
  ].join("|");
  return fnv1a(seed);
}