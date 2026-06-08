/**
 * Pinterest destination URL validator.
 *
 * Validates that a pin's destination_link:
 *   1. Uses the canonical `https://getpawsy.pet/products/{slug}` shape.
 *   2. Resolves to HTTP 200 after following redirects.
 *   3. The slug exists in the active product catalog with stock > 0.
 *
 * Returns a structured verdict that the caller persists into
 * pinterest_pin_queue (final_resolved_url, http_status, product_slug_found,
 * validation_status, last_validation_error, last_validated_at).
 *
 * Failure reasons (kept stable for the admin UI):
 *   - destination_404         → final HTTP status was 404 / non-200
 *   - product_not_found       → slug missing or product inactive/duplicate
 *   - product_oos             → product exists but stock = 0
 *   - wrong_destination_url   → URL shape is not /products/{slug}
 *   - category_mismatch       → final URL is a category/listing page, not PDP
 */

const ALLOWED_HOST = "getpawsy.pet";

export type ValidationStatus = "valid" | "invalid";
export type ValidationReason =
  | "destination_404"
  | "product_not_found"
  | "product_oos"
  | "wrong_destination_url"
  | "category_mismatch";

export interface ValidationResult {
  ok: boolean;
  final_resolved_url: string | null;
  http_status: number | null;
  product_slug_found: boolean;
  validation_status: ValidationStatus;
  last_validation_error: ValidationReason | null;
  reason_detail?: string;
}

function extractSlug(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname !== ALLOWED_HOST && !u.hostname.endsWith(`.${ALLOWED_HOST}`)) return null;
    const m = u.pathname.match(/^\/products\/([^\/?#]+)\/?$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function fetchFinal(url: string): Promise<{ status: number; finalUrl: string }> {
  // Use GET (HEAD is sometimes 405 on Vite/CDN edges) with a sane UA.
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "User-Agent": "GetPawsyDestinationValidator/1.0" },
  });
  return { status: res.status, finalUrl: res.url };
}

export async function validateDestination(
  sb: any,
  destinationLink: string,
): Promise<ValidationResult> {
  const base: Omit<ValidationResult, "validation_status" | "ok"> = {
    final_resolved_url: null,
    http_status: null,
    product_slug_found: false,
    last_validation_error: null,
  };

  // 1. Shape check
  const slug = extractSlug(destinationLink);
  if (!slug) {
    return {
      ...base,
      ok: false,
      validation_status: "invalid",
      last_validation_error: "wrong_destination_url",
      reason_detail: `URL must be https://${ALLOWED_HOST}/products/{slug}`,
    };
  }

  // 2. Catalog check (products_public = in-stock, active, non-duplicate)
  const { data: pub } = await sb
    .from("products_public")
    .select("slug, stock")
    .eq("slug", slug)
    .maybeSingle();

  if (!pub) {
    // Distinguish "doesn't exist / inactive" vs "OOS"
    const { data: any_p } = await sb
      .from("products")
      .select("slug, is_active, stock, availability")
      .eq("slug", slug)
      .maybeSingle();
    if (!any_p || any_p.is_active === false) {
      return {
        ...base,
        ok: false,
        validation_status: "invalid",
        last_validation_error: "product_not_found",
        reason_detail: any_p ? "is_active=false" : "slug not in products table",
      };
    }
    return {
      ...base,
      product_slug_found: true,
      ok: false,
      validation_status: "invalid",
      last_validation_error: "product_oos",
      reason_detail: `stock=${any_p.stock} availability=${any_p.availability}`,
    };
  }

  // 3. Live HTTP check — must return 200 and stay on /products/{slug}
  try {
    const { status, finalUrl } = await fetchFinal(destinationLink);
    if (status !== 200) {
      return {
        ...base,
        product_slug_found: true,
        final_resolved_url: finalUrl,
        http_status: status,
        ok: false,
        validation_status: "invalid",
        last_validation_error: "destination_404",
      };
    }
    const finalSlug = extractSlug(finalUrl);
    if (!finalSlug) {
      return {
        ...base,
        product_slug_found: true,
        final_resolved_url: finalUrl,
        http_status: status,
        ok: false,
        validation_status: "invalid",
        last_validation_error: "category_mismatch",
        reason_detail: "Final URL is not a /products/{slug} page",
      };
    }
    return {
      final_resolved_url: finalUrl,
      http_status: status,
      product_slug_found: true,
      ok: true,
      validation_status: "valid",
      last_validation_error: null,
    };
  } catch (e) {
    return {
      ...base,
      product_slug_found: true,
      ok: false,
      validation_status: "invalid",
      last_validation_error: "destination_404",
      reason_detail: `fetch failed: ${(e as Error).message}`,
    };
  }
}