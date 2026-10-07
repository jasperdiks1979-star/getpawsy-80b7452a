/**
 * Truthful product identifier policy — shared by the PDP Product JSON-LD,
 * the build-time prerendered schema and the Merchant XML feed.
 *
 * - brand: only a documented `products.brand` value. GetPawsy is the retailer
 *   (seller), not the manufacturer; it is never used as a fill-in brand.
 * - gtin:  only a documented value with a valid GS1 check digit.
 * - mpn:   only a documented `products.mpn` value. Database ids and supplier /
 *          internal SKUs are never presented as manufacturer part numbers.
 * - identifier_exists: true only when a GTIN, or brand + MPN, is documented.
 */

export interface IdentifierInput {
  id?: string | null;
  sku?: string | null;
  brand?: string | null;
  gtin?: string | null;
  mpn?: string | null;
}

export interface ResolvedIdentifiers {
  brand: string | null;
  gtin: string | null;
  mpn: string | null;
  identifierExists: boolean;
}

const PLACEHOLDER = /^(?:n\/?a|none|null|unknown|unbranded|generic|no ?brand|-|0)$/i;
const RETAILER_BRAND = /^get\s*pawsy$/i;

function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || PLACEHOLDER.test(t)) return null;
  return t;
}

export function isValidGtin(value: string): boolean {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false;
  if (/^0+$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  digits.reverse().forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10 === check;
}

export function resolveProductIdentifiers(p: IdentifierInput): ResolvedIdentifiers {
  // Stored "GetPawsy" on supplier-sourced (CJ) products is a retailer fill-in,
  // not a documented private label — no private-label evidence exists.
  const rawBrand = clean(p.brand);
  const brand = rawBrand && RETAILER_BRAND.test(rawBrand) ? null : rawBrand;
  const rawGtin = clean(p.gtin)?.replace(/[\s-]/g, '') ?? null;
  const gtin = rawGtin && isValidGtin(rawGtin) ? rawGtin : null;
  let mpn = clean(p.mpn);
  const internal = [p.id, p.sku].map((v) => (v ?? '').trim().toLowerCase()).filter(Boolean);
  if (mpn && internal.includes(mpn.toLowerCase())) mpn = null;
  return { brand, gtin, mpn, identifierExists: !!gtin || (!!brand && !!mpn) };
}
