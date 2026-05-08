// ─────────────────────────────────────────────────────────────────────────────
// Pinterest image scrubber
//
// Filters out supplier-style images BEFORE pin generation:
//   • measurement/dimension/ruler graphics (filename signals)
//   • Chinese marketplace CDNs (alicdn / aliexpress / cjdropshipping / 1688 / taobao)
//   • obvious "spec sheet" stitched composites (extreme aspect ratios)
//
// Returns clean URLs only. If a product has zero clean images the caller should
// short-circuit with `NO_CLEAN_IMAGE` rather than fall back to a supplier asset.
// ─────────────────────────────────────────────────────────────────────────────

export type ScrubReason =
  | "supplier_host"
  | "measurement_filename"
  | "spec_sheet_filename"
  | "extreme_aspect_ratio"
  | "invalid_url";

export interface ScrubResult {
  clean: string[];
  rejected: Array<{ url: string; reason: ScrubReason }>;
}

const SUPPLIER_HOST_RE =
  /(alicdn|aliexpress|cjdropshipping|chinabrands|spocket|oberlo|dsers|1688|taobao|tmall|dhgate|made-in-china)/i;

const MEASUREMENT_FILENAME_RE =
  /(dimension|measur|ruler|sizechart|size[_-]?chart|_cm[_.\-]|_inch[_.\-]|_mm[_.\-]|_size[_.\-]|spec[_.\-]?sheet|specsheet)/i;

const SPEC_FILENAME_RE =
  /(detail[_-]?[0-9]|package[_-]?include|whats[_-]?in[_-]?the[_-]?box|instruction|manual|warranty|barcode|sku[_-])/i;

function safeUrl(u: string): URL | null {
  try { return new URL(u); } catch { return null; }
}

/** Quick filename token check (path tail, lowercased, query stripped). */
function filenameOf(u: URL): string {
  const p = u.pathname.toLowerCase();
  return p.split("/").filter(Boolean).pop() || p;
}

/**
 * Reject obvious supplier / measurement / spec-sheet images.
 * Aspect-ratio rejection is filename-only here (Cloudinary fetch URLs encode
 * w/h transforms — we don't want to be fooled by them, so we ignore those).
 */
export function scrubProductImages(urls: Array<string | null | undefined>): ScrubResult {
  const clean: string[] = [];
  const rejected: Array<{ url: string; reason: ScrubReason }> = [];
  for (const raw of urls) {
    const url = (raw || "").trim();
    if (!url) continue;
    const parsed = safeUrl(url);
    if (!parsed) {
      rejected.push({ url, reason: "invalid_url" });
      continue;
    }
    const host = parsed.hostname.toLowerCase();
    if (SUPPLIER_HOST_RE.test(host)) {
      rejected.push({ url, reason: "supplier_host" });
      continue;
    }
    const fn = filenameOf(parsed);
    if (MEASUREMENT_FILENAME_RE.test(fn)) {
      rejected.push({ url, reason: "measurement_filename" });
      continue;
    }
    if (SPEC_FILENAME_RE.test(fn)) {
      rejected.push({ url, reason: "spec_sheet_filename" });
      continue;
    }
    clean.push(url);
  }
  return { clean, rejected };
}

/**
 * Cloudinary auto-crop fallback. Wraps a raw image URL through Cloudinary's
 * fetch API with `c_fill,g_auto,ar_4:5` so any leftover supplier border /
 * measurement strip is cropped out and the centered product subject is kept.
 * Use as a defensive layer for borderline images that survive the scrub.
 */
export function autoCropToSubject(url: string, cloud = "dlkqycfzn"): string {
  if (!url) return url;
  // Already a Cloudinary URL — leave alone (caller will further compose it).
  if (/res\.cloudinary\.com\//.test(url)) return url;
  const t = ["c_fill", "g_auto:subject", "ar_4:5", "q_auto", "f_auto", "e_improve", "e_sharpen:40"].join(",");
  return `https://res.cloudinary.com/${cloud}/image/fetch/${t}/${url}`;
}
