/**
 * Product evidence model (Phase 4 A).
 *
 * WHY THIS EXISTS
 * ---------------
 * PDP copy may only state facts we can point at a source for. This module is
 * the single place that turns the data we actually hold (the supplier variant
 * payload stored on `products.variants` and the supplier's own specification
 * block inside `products.description`) into typed facts, each classified as:
 *
 *   VERIFIED  — one source states it and no other source contradicts it
 *   CONFLICT  — two sources state different values -> never shown as a fact
 *   UNKNOWN   — no source states it -> the claim is omitted entirely
 *
 * Nothing here invents, rounds up, or infers a value. Package ("packed")
 * dimensions are labelled as packed dimensions, never as product dimensions,
 * because the supplier payload measures the shipping carton.
 */

export type EvidenceStatus = 'VERIFIED' | 'CONFLICT' | 'UNKNOWN';

export type EvidenceKey =
  | 'origin'
  | 'product_dimensions'
  | 'packed_dimensions'
  | 'shipping_weight'
  | 'materials'
  | 'capacity'
  | 'assembly'
  | 'cleaning'
  | 'included_items'
  | 'variant_identities'
  | 'compliance';

export interface EvidenceField {
  key: EvidenceKey;
  label: string;
  status: EvidenceStatus;
  /** Present only when status === 'VERIFIED'. */
  value?: string;
  /** Where the value came from — shown to admins, not to shoppers. */
  source?: string;
  /** For CONFLICT: the differing values. */
  conflict?: string[];
}

export interface EvidenceProductInput {
  id?: string;
  name?: string | null;
  description?: string | null;
  variants?: unknown;
  weight?: number | string | null;
  supplier_warehouse?: string | null;
}

interface RawVariant {
  vid?: string | number | null;
  variantKey?: string | null;
  variantNameEn?: string | null;
  variantSku?: string | null;
  variantStandard?: string | null;
  variantWeight?: number | string | null;
  inventories?: Array<{ countryCode?: string | null; verifiedWarehouse?: number | null }> | null;
}

const LABELS: Record<EvidenceKey, string> = {
  origin: 'Ships from',
  product_dimensions: 'Product dimensions',
  packed_dimensions: 'Packed dimensions',
  shipping_weight: 'Shipping weight',
  materials: 'Materials',
  capacity: 'Suitable for',
  assembly: 'Assembly',
  cleaning: 'Cleaning',
  included_items: 'In the box',
  variant_identities: 'Options',
  compliance: 'Compliance / safety',
};

const ORDER: EvidenceKey[] = [
  'product_dimensions',
  'packed_dimensions',
  'shipping_weight',
  'materials',
  'capacity',
  'included_items',
  'assembly',
  'cleaning',
  'variant_identities',
  'origin',
  'compliance',
];

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(li|p|ul|h[1-6]|div)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function parseVariants(raw: unknown): RawVariant[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is RawVariant => !!v && typeof v === 'object');
}

const MM_PER_INCH = 25.4;
function mmToInches(mm: number): number {
  return Math.round((mm / MM_PER_INCH) * 10) / 10;
}

/** `long=533,width=380,height=140` (mm) -> `21.0 x 15.0 x 5.5 in` */
export function formatPackedDimensions(standard: string): string | null {
  const nums: Record<string, number> = {};
  for (const part of String(standard).split(',')) {
    const m = /^\s*(long|length|width|height)\s*=\s*([\d.]+)\s*$/i.exec(part);
    if (m) nums[m[1].toLowerCase() === 'length' ? 'long' : m[1].toLowerCase()] = Number(m[2]);
  }
  const { long, width, height } = nums;
  if (!long || !width || !height) return null;
  return `${mmToInches(long)} x ${mmToInches(width)} x ${mmToInches(height)} in`;
}

function gramsToPounds(g: number): string {
  return `${Math.round((g / 453.592) * 10) / 10} lb`;
}

/**
 * Supplier specification block parser. Only reads explicit `Label: value`
 * lines from the supplier's own copy; free marketing prose is ignored.
 */
export function parseSupplierSpecs(description: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!description) return out;
  const text = stripHtml(description);
  const lines = text.split('\n');
  let inPackage = false;
  const packageItems: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/^[-–•\s]+/, '').trim();
    if (!line) continue;

    if (/^package includes\b/i.test(line)) {
      inPackage = true;
      continue;
    }
    if (/^(specification|features|description)\b/i.test(line)) {
      inPackage = false;
      continue;
    }

    if (inPackage) {
      const item = /^(\d+)\s*x\s*(.+)$/i.exec(line);
      if (item) {
        packageItems.push(`${item[1]} x ${item[2].trim()}`);
        continue;
      }
      if (/^[A-Za-z].{0,60}:/.test(line)) inPackage = false;
      else continue;
    }

    const kv = /^([A-Za-z][A-Za-z0-9 /&'"()-]{2,40}?)\s*:\s*(.+)$/.exec(line);
    if (kv) {
      const key = kv[1].trim().toLowerCase();
      const value = kv[2].trim().replace(/\s*\.$/, '');
      if (value && !out[key]) out[key] = value;
      continue;
    }

    if (/^no assembly required/i.test(line)) out['assembly'] = 'No assembly required';
    if (/^suitable for (cats?|pets?)\b/i.test(line)) out['suitable for'] = line.replace(/\s*\.$/, '');
  }

  if (packageItems.length) out['package includes'] = packageItems.join(', ');
  return out;
}

function verified(key: EvidenceKey, value: string, source: string): EvidenceField {
  return { key, label: LABELS[key], status: 'VERIFIED', value, source };
}
function unknown(key: EvidenceKey): EvidenceField {
  return { key, label: LABELS[key], status: 'UNKNOWN' };
}
function conflict(key: EvidenceKey, values: string[], source: string): EvidenceField {
  return { key, label: LABELS[key], status: 'CONFLICT', conflict: values, source };
}

export interface ProductEvidence {
  fields: EvidenceField[];
  byKey: Record<EvidenceKey, EvidenceField>;
  verifiedFields: EvidenceField[];
  unknownKeys: EvidenceKey[];
  conflictKeys: EvidenceKey[];
}

export function buildProductEvidence(product: EvidenceProductInput): ProductEvidence {
  const variants = parseVariants(product.variants);
  const specs = parseSupplierSpecs(product.description);
  const fields: EvidenceField[] = [];

  // ── origin ────────────────────────────────────────────────────────────────
  const warehouse = String(product.supplier_warehouse ?? '').trim().toUpperCase();
  const cjUsVerified = variants.some((v) =>
    (v.inventories ?? []).some(
      (inv) => String(inv?.countryCode ?? '').toUpperCase() === 'US' && Number(inv?.verifiedWarehouse) === 1,
    ),
  );
  if (warehouse === 'US' && cjUsVerified) {
    fields.push(verified('origin', 'a United States warehouse', 'supplier warehouse field + verified US inventory record'));
  } else if (warehouse === 'US' || cjUsVerified) {
    fields.push(verified('origin', 'a United States warehouse', warehouse === 'US' ? 'supplier warehouse field' : 'verified US inventory record'));
  } else {
    fields.push(unknown('origin'));
  }

  // ── product dimensions (supplier spec only — never the carton) ────────────
  const dimSpec = specs['overall dimensions'] || specs['product dimensions'] || specs['dimensions'];
  fields.push(dimSpec ? verified('product_dimensions', dimSpec, 'supplier specification block') : unknown('product_dimensions'));

  // ── packed dimensions ─────────────────────────────────────────────────────
  const packed = Array.from(
    new Set(
      variants
        .map((v) => (v.variantStandard ? formatPackedDimensions(String(v.variantStandard)) : null))
        .filter((s): s is string => !!s),
    ),
  );
  if (packed.length === 1) fields.push(verified('packed_dimensions', packed[0], 'supplier variant payload'));
  else if (packed.length > 1) fields.push(verified('packed_dimensions', `varies by option (${packed.join('; ')})`, 'supplier variant payload'));
  else fields.push(unknown('packed_dimensions'));

  // ── shipping weight (variant payload vs product row) ──────────────────────
  const variantWeights = Array.from(
    new Set(variants.map((v) => Number(v.variantWeight)).filter((n) => Number.isFinite(n) && n > 0)),
  );
  const rowWeight = Number(product.weight);
  if (variantWeights.length === 1) {
    const w = variantWeights[0];
    if (Number.isFinite(rowWeight) && rowWeight > 0 && Math.abs(rowWeight - w) / w > 0.05) {
      fields.push(conflict('shipping_weight', [gramsToPounds(w), gramsToPounds(rowWeight)], 'supplier variant payload vs product record'));
    } else {
      fields.push(verified('shipping_weight', gramsToPounds(w), 'supplier variant payload'));
    }
  } else if (variantWeights.length > 1) {
    fields.push(
      verified(
        'shipping_weight',
        `varies by option (${variantWeights.map(gramsToPounds).join('; ')})`,
        'supplier variant payload',
      ),
    );
  } else {
    fields.push(unknown('shipping_weight'));
  }

  // ── materials / capacity / assembly / cleaning / included items ───────────
  const material = specs['material'] || specs['materials'];
  fields.push(material ? verified('materials', material, 'supplier specification block') : unknown('materials'));

  const capacity = specs['suitable for'] || specs['weight capacity'] || specs['load capacity'] || specs['capacity'];
  fields.push(capacity ? verified('capacity', capacity, 'supplier specification block') : unknown('capacity'));

  const assembly = specs['assembly'] || specs['installation'];
  fields.push(assembly ? verified('assembly', assembly, 'supplier specification block') : unknown('assembly'));

  const cleaning = specs['cleaning'] || specs['care'] || specs['maintenance'];
  fields.push(cleaning ? verified('cleaning', cleaning, 'supplier specification block') : unknown('cleaning'));

  const included = specs['package includes'] || specs['included'];
  fields.push(included ? verified('included_items', included, 'supplier specification block') : unknown('included_items'));

  // ── variant identities ────────────────────────────────────────────────────
  const identities = variants
    .map((v) => String(v.variantNameEn ?? v.variantKey ?? '').trim())
    .filter(Boolean);
  const allHaveVid = variants.length > 0 && variants.every((v) => String(v.vid ?? '').trim().length > 0);
  if (identities.length && allHaveVid) {
    fields.push(verified('variant_identities', identities.join(', '), 'supplier variant payload'));
  } else {
    fields.push(unknown('variant_identities'));
  }

  // ── compliance / safety: no source in the catalogue, ever ─────────────────
  const compliance = specs['certification'] || specs['certifications'] || specs['compliance'];
  fields.push(compliance ? verified('compliance', compliance, 'supplier specification block') : unknown('compliance'));

  const ordered = ORDER.map((k) => fields.find((f) => f.key === k)!).filter(Boolean);
  const byKey = Object.fromEntries(ordered.map((f) => [f.key, f])) as Record<EvidenceKey, EvidenceField>;

  return {
    fields: ordered,
    byKey,
    verifiedFields: ordered.filter((f) => f.status === 'VERIFIED'),
    unknownKeys: ordered.filter((f) => f.status === 'UNKNOWN').map((f) => f.key),
    conflictKeys: ordered.filter((f) => f.status === 'CONFLICT').map((f) => f.key),
  };
}

/** Shopper-facing spec rows: VERIFIED only, origin handled by delivery-truth. */
export function shopperSpecRows(evidence: ProductEvidence): Array<{ label: string; value: string }> {
  return evidence.verifiedFields
    .filter((f) => f.key !== 'origin' && f.key !== 'variant_identities')
    .map((f) => ({ label: f.label, value: f.value! }));
}

/**
 * Key-point bullets built ONLY from VERIFIED supplier facts.
 *
 * Replaces the old category-guessed bullet copy, which asserted automation,
 * sensors, materials, safety and weight limits that no source documents. A
 * product with no verified spec facts gets no bullets at all — an empty list
 * is the correct output, never a generic filler claim.
 */
const BULLET_KEYS: Array<{ key: EvidenceKey; prefix: string }> = [
  { key: 'product_dimensions', prefix: 'Dimensions' },
  { key: 'materials', prefix: 'Material' },
  { key: 'capacity', prefix: 'Suitable for' },
  { key: 'assembly', prefix: 'Assembly' },
  { key: 'cleaning', prefix: 'Care' },
  { key: 'included_items', prefix: 'In the box' },
];

export function evidenceBenefitBullets(evidence: ProductEvidence, limit = 5): string[] {
  return BULLET_KEYS.filter(({ key }) => evidence.byKey[key]?.status === 'VERIFIED')
    .map(({ key, prefix }) => {
      const value = evidence.byKey[key].value!.trim();
      const lower = value.toLowerCase();
      // Avoid "Suitable for suitable for ..." when the source already says it.
      return lower.startsWith(prefix.toLowerCase()) ? value : `${prefix}: ${value}`;
    })
    .slice(0, limit);
}
