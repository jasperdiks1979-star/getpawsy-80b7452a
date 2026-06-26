/**
 * Product Image URL Resolver
 * 
 * Resolves legacy `/images/products/<filename>` paths to CDN URLs.
 * Backed by the manifest produced by the 2026-06-26 CDN migration.
 * If a filename is not in the manifest, the original path is returned
 * (safe fallback — caller can decide how to handle).
 */
import manifest from "@/data/migration/product-images-manifest.json";

const MAP = manifest as Record<string, string>;
const PREFIX = "/images/products/";

/** Resolve a product image path to its CDN URL. */
export function resolveProductImage(path: string | null | undefined): string {
  if (!path) return "/placeholder.svg";
  const trimmed = path.trim();
  if (!trimmed.startsWith(PREFIX)) return trimmed;
  const filename = trimmed.slice(PREFIX.length).split("?")[0].split("#")[0];
  return MAP[filename] ?? trimmed;
}

/** Rewrite any string by replacing every legacy product-image path with its CDN URL. */
export function rewriteProductImageUrls(input: string): string {
  return input.replace(/\/images\/products\/([A-Za-z0-9._-]+)/g, (_, fn) => MAP[fn] ?? `/images/products/${fn}`);
}

export const PRODUCT_IMAGE_MANIFEST = MAP;