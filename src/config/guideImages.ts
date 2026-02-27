/**
 * Centralized Guide Image Configuration
 *
 * ALL guide card thumbnails MUST be registered here.
 * This is the single source of truth for guide imagery.
 *
 * ## How to add a new guide image
 * 1. Add optimized WebP to /public/guides/<slug>.webp (1400×900, ≤120KB)
 * 2. Add an entry below with unique `src` and descriptive `alt`
 * 3. The dev-mode duplicate scanner will warn if you reuse a path
 *
 * ## Fallback
 * If a guide slug has no entry here, it receives `/guides/default-guide.webp`.
 * The fallback is NEVER another guide's image.
 */

export interface GuideImageEntry {
  /** Path relative to public root, e.g. "/guides/cat-trees-large-2026.webp" */
  src: string;
  /** Descriptive alt text for accessibility & SEO */
  alt: string;
}

export const GUIDE_IMAGE_CONFIG: Record<string, GuideImageEntry> = {
  'best-cat-trees-large-cats-2026': {
    src: '/guides/cat-trees-large-2026.webp',
    alt: 'Large Maine Coon cat lounging on a sturdy multi-level cat tree in a bright modern living room',
  },
  'best-cat-litter-box-2026': {
    src: '/guides/cat-litter-boxes-2026.webp',
    alt: 'Premium enclosed cat litter box in a clean minimalist interior with warm natural lighting',
  },
};

// ── Fallback ──────────────────────────────────────────────────────────────────
export const DEFAULT_GUIDE_IMAGE: GuideImageEntry = {
  src: '/guides/default-guide.webp',
  alt: 'GetPawsy pet care guide',
};

/**
 * Resolve the image entry for a guide slug.
 * Returns the specific image if mapped, otherwise the default fallback.
 */
export function getGuideImage(slug: string): GuideImageEntry {
  return GUIDE_IMAGE_CONFIG[slug] ?? DEFAULT_GUIDE_IMAGE;
}

// ── Dev-mode duplicate detection ──────────────────────────────────────────────
if (import.meta.env.DEV) {
  const seen = new Map<string, string>();
  for (const [slug, entry] of Object.entries(GUIDE_IMAGE_CONFIG)) {
    const existing = seen.get(entry.src);
    if (existing) {
      console.warn(
        `[GUIDE-IMAGE-GUARD] Duplicate thumbnail detected!\n` +
        `  "${slug}" and "${existing}" both reference "${entry.src}".\n` +
        `  Every guide MUST have a unique thumbnail.`
      );
    } else {
      seen.set(entry.src, slug);
    }
  }
}
