/**
 * Category matching helpers shared by the /products page filter.
 *
 * Extracted verbatim from src/pages/Products.tsx so the exact production
 * matching logic is covered by regression tests (see
 * src/test/category-slug-matching.test.ts).
 *
 * Root incident (2026-09-25): the nav link for Cat Trees passes the short
 * slug "cat-trees", but products are filed under "Cat Trees & Condos".
 * Direct normalization never matched, so the category page rendered 0
 * products. The short-slug prefix rule below is the fix — do not remove it.
 */

// Convert display name to slug.
// IMPORTANT: This must match exactly how category slugs are stored in database
export const toSlug = (str: string): string => {
  return str
    .toLowerCase()
    .trim()
    .replace(/&/g, '') // Remove ampersand entirely to match database slugs
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

// Normalize category for comparison - handles both "Dog Collars & Leashes" and "dog-collars-leashes"
// Also handles spaces vs hyphens and case differences
export const normalizeCategory = (str: string): string => {
  return str
    .toLowerCase()
    .replace(/&/g, 'and')     // Normalize ampersand to 'and'
    .replace(/\s+/g, '-')     // Convert spaces to hyphens
    .replace(/[^\w-]/g, '')   // Remove other special chars
    .replace(/-+/g, '-')      // Collapse multiple hyphens
    .replace(/^-|-$/g, '');   // Remove leading/trailing hyphens
};

// Alternative normalization that removes 'and' for matching variations
export const normalizeCategoryAlt = (str: string): string => {
  return str
    .toLowerCase()
    .replace(/&/g, '')        // Remove ampersand
    .replace(/\band\b/g, '')  // Remove word 'and'
    .replace(/\s+/g, '-')     // Convert spaces to hyphens
    .replace(/[^\w-]/g, '')   // Remove other special chars
    .replace(/-+/g, '-')      // Collapse multiple hyphens
    .replace(/^-|-$/g, '');   // Remove leading/trailing hyphens
};

/**
 * Direct category match between a product's catalog category and a selected
 * filter value (nav slug or display name). Mirrors the direct-match and
 * short-slug-prefix branches of the Products page filter. Subcategory
 * descendant expansion stays in the page component.
 */
export const categoryDirectMatch = (productCategory: string, selected: string): boolean => {
  const productCategoryNormalized = normalizeCategory(productCategory);
  const productCategoryAlt = normalizeCategoryAlt(productCategory);
  const selectedNormalized = normalizeCategory(selected);
  const selectedAlt = normalizeCategoryAlt(selected);

  if (
    productCategoryNormalized === selectedNormalized ||
    productCategoryAlt === selectedAlt ||
    productCategoryNormalized === selectedAlt ||
    productCategoryAlt === selectedNormalized
  ) {
    return true;
  }

  // Short nav slugs (e.g. "cat-trees") must match their full category
  // ("Cat Trees & Condos" -> "cat-trees-condos"), mirroring the
  // server-side fast path so the full catalog doesn't filter to 0.
  const selectedSlug = toSlug(selected);
  if (selectedSlug && toSlug(productCategory).startsWith(`${selectedSlug}-`)) {
    return true;
  }

  return false;
};
