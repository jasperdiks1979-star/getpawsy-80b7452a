// ─────────────────────────────────────────────────────────────────────────────
// Pinterest media-host gate
//
// Only own-domain images (getpawsy.pet) are allowed to reach the Pinterest
// publish pipeline. External hosts — especially supplier CDNs like
// cf.cjdropshipping.com / oss-cf.cjdropshipping.com — must be filtered out
// BEFORE selection so we never consume cap or create failed publish attempts
// chasing an `unexpected_host` rejection.
//
// Shared by:
//   • pinterest-automation (cold-start + recovery selectors, diagnostics)
//   • pinterest-autopilot   (scoring/selection)
// ─────────────────────────────────────────────────────────────────────────────

export const OWN_DOMAIN_HOSTS: ReadonlySet<string> = new Set([
  "getpawsy.pet",
  "www.getpawsy.pet",
]);

export const OWN_DOMAIN_PREFIX = "https://getpawsy.pet/";

export function isOwnDomainImage(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return false;
    return OWN_DOMAIN_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Walk a product object's image fields and return the first own-domain image.
 * Order: image_url → images[] → gallery[] → media[] (urls or objects).
 * Returns null if no own-domain image exists anywhere on the product.
 */
export function pickOwnDomainImage(product: any): string | null {
  if (!product) return null;
  const candidates: Array<string | null | undefined> = [];
  candidates.push(product.image_url);
  const arrays = ["images", "gallery", "media", "image_gallery"];
  for (const key of arrays) {
    const v = product?.[key];
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string") candidates.push(item);
        else if (item && typeof item === "object") {
          candidates.push(item.url || item.src || item.image_url || item.href);
        }
      }
    }
  }
  for (const c of candidates) if (isOwnDomainImage(c)) return String(c).trim();
  return null;
}

export interface MediaHostGate {
  ok: boolean;
  reason: "ok" | "external_media_host" | "no_own_domain_media";
  selected_image: string | null;
  selected_host: string | null;
  fallback_used: boolean;
}

/**
 * Produce a diagnostic-ready gate result for a product.
 */
export function evaluateMediaHost(product: any): MediaHostGate {
  const primary = product?.image_url || null;
  const own = pickOwnDomainImage(product);
  if (!own) {
    return {
      ok: false,
      reason: primary ? "external_media_host" : "no_own_domain_media",
      selected_image: null,
      selected_host: hostOf(primary),
      fallback_used: false,
    };
  }
  return {
    ok: true,
    reason: "ok",
    selected_image: own,
    selected_host: hostOf(own),
    fallback_used: own !== primary,
  };
}

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

/**
 * Bulk classifier — for diagnostics. Returns counts + first 20 blocked slugs.
 */
export function classifyProductsByMediaHost(products: any[]): {
  total: number;
  own_domain: number;
  external_blocked: number;
  no_image: number;
  blocked_sample: Array<{ slug: string; host: string | null }>;
  host_breakdown: Record<string, number>;
} {
  let own = 0, ext = 0, none = 0;
  const blocked: Array<{ slug: string; host: string | null }> = [];
  const hostBreakdown: Record<string, number> = {};
  for (const p of products || []) {
    const gate = evaluateMediaHost(p);
    if (gate.ok) {
      own++;
      const h = gate.selected_host || "unknown";
      hostBreakdown[h] = (hostBreakdown[h] || 0) + 1;
    } else if (gate.reason === "external_media_host") {
      ext++;
      const h = gate.selected_host || "unknown";
      hostBreakdown[h] = (hostBreakdown[h] || 0) + 1;
      if (blocked.length < 20) blocked.push({ slug: String(p?.slug || ""), host: gate.selected_host });
    } else {
      none++;
    }
  }
  return {
    total: (products || []).length,
    own_domain: own,
    external_blocked: ext,
    no_image: none,
    blocked_sample: blocked,
    host_breakdown: hostBreakdown,
  };
}