/**
 * PHASE 10B — Merchant release integrity (pure, deterministic).
 *
 * Single source of truth for the rules that decide whether a generated
 * merchant artifact (Google feed, sitemap) may be released:
 *
 *  1. Sandbox fixtures must never reach public/ or dist/.
 *  2. Stale artifacts from a previous build are never proof of a current
 *     successful generation — they must be removed before validation.
 *  3. Malformed feed entries and duplicate canonical URLs must never be
 *     emitted.
 *  4. Zero eligible real products fails closed with a precise diagnostic.
 *
 * Everything here is pure: no I/O, no network, no mutation of inputs.
 * The sitemap generator (scripts/generate-sitemaps.mjs) mirrors the fixture
 * patterns in scripts/merchant-integrity.mjs; a test keeps them in sync.
 */

/** Markers that identify a non-production sandbox fixture row. */
export const SANDBOX_FIXTURE_PATTERNS: RegExp[] = [
  /sandbox/i,
  /\bfixture\b/i,
  /\bdo[\s_-]*not[\s_-]*ship\b/i,
  /\btest[\s_-]*only\b/i,
  /\bplaceholder\b/i,
];

export interface FixtureCandidate {
  id?: string | null;
  sku?: string | null;
  slug?: string | null;
  name?: string | null;
  title?: string | null;
  path?: string | null;
  loc?: string | null;
}

/** True when any identifying field carries a sandbox-fixture marker. */
export function isSandboxFixture(candidate: FixtureCandidate | null | undefined): boolean {
  if (!candidate) return false;
  const haystack = [
    candidate.id,
    candidate.sku,
    candidate.slug,
    candidate.name,
    candidate.title,
    candidate.path,
    candidate.loc,
  ]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' ');
  if (!haystack) return false;
  return SANDBOX_FIXTURE_PATTERNS.some((re) => re.test(haystack));
}

/** Drop every sandbox fixture from a candidate list. Never mutates input. */
export function excludeSandboxFixtures<T extends FixtureCandidate>(items: readonly T[]): T[] {
  return items.filter((item) => !isSandboxFixture(item));
}

/**
 * Identifying fields of a rendered artifact: canonical URLs, ids, links and
 * titles. Free-text product descriptions are deliberately NOT scanned — real
 * copy legitimately contains phrases like "we do not ship on weekends", which
 * is prose, not a fixture marker.
 */
const IDENTIFYING_TAG_RE =
  /<(?:loc|link|title|g:id|g:mpn|g:item_group_id|g:brand)>([\s\S]*?)<\/(?:loc|link|title|g:id|g:mpn|g:item_group_id|g:brand)>/gi;

export function extractIdentifyingXmlText(xml: string): string {
  const source = String(xml ?? '');
  const matches = [...source.matchAll(IDENTIFYING_TAG_RE)].map((m) => m[1]);
  // No identifying tags at all (plain fragment / raw value): scan as-is.
  return matches.length > 0 ? matches.join(' ') : source;
}

/** True when a rendered XML document still contains a fixture marker. */
export function containsSandboxFixture(xml: string): boolean {
  const haystack = extractIdentifyingXmlText(xml);
  return SANDBOX_FIXTURE_PATTERNS.some((re) => re.test(haystack));
}


/** Fail closed when a generated artifact would ship a sandbox fixture. */
export function assertNoSandboxFixtures(xml: string, label: string): void {
  if (containsSandboxFixture(xml)) {
    throw new Error(
      `[merchant-integrity] FATAL: ${label} contains SANDBOX fixture content. ` +
        `Sandbox fixtures may never be written to public/ or dist/.`
    );
  }
}

// ── Stale artifacts ───────────────────────────────────────────────────

/**
 * Build outputs that must be regenerated from the current eligible catalog.
 * Reusing a previous copy of any of these files is never valid proof of a
 * successful generation.
 */
export const STALE_ARTIFACT_FILES = [
  'merchant-feed.xml',
  'google-shopping-feed.xml',
  'google-feed.xml',
  'sitemap.xml',
  'sitemap-pages.xml',
  'sitemap-products-1.xml',
  'sitemap-collections.xml',
  'sitemap-guides.xml',
  'sitemap-blog.xml',
] as const;

export function isStaleArtifactFile(fileName: string): boolean {
  return (STALE_ARTIFACT_FILES as readonly string[]).includes(fileName);
}

/**
 * A previously generated artifact is never acceptable as the current build's
 * output. Always throws — kept as an explicit, testable contract so no future
 * change can silently reintroduce artifact reuse.
 */
export function rejectStaleArtifact(label: string): never {
  throw new Error(
    `[merchant-integrity] FATAL: refusing to reuse a previously generated artifact for ${label}. ` +
      `Current build outputs must be generated from the current eligible catalog.`
  );
}

// ── Feed item validation ──────────────────────────────────────────────

export interface FeedItemLike {
  id?: string | null;
  title?: string | null;
  description?: string | null;
  link?: string | null;
  image_link?: string | null;
  price?: string | null;
  availability?: string | null;
  brand?: string | null;
  condition?: string | null;
}

// Google Merchant Center availability values. The feed generator emits the
// canonical spaced forms ("in stock"); underscored forms are also accepted.
const VALID_AVAILABILITY = new Set([
  'in stock', 'out of stock', 'preorder', 'backorder',
  'in_stock', 'out_of_stock',
]);
const PRICE_RE = /^\d+\.\d{2} [A-Z]{3}$/;

/** Returns the list of contract violations for a single feed item. */
export function validateFeedItem(item: FeedItemLike | null | undefined): string[] {
  const issues: string[] = [];
  if (!item) return ['missing_item'];

  const req = (field: keyof FeedItemLike) => {
    const v = item[field];
    return typeof v === 'string' && v.trim().length > 0;
  };

  for (const field of ['id', 'title', 'description', 'link', 'image_link', 'price', 'availability', 'brand', 'condition'] as const) {
    if (!req(field)) issues.push(`missing_${field}`);
  }

  if (req('link') && !/^https:\/\/[^\s"']+$/.test(item.link!.trim())) issues.push('invalid_link');
  if (req('image_link') && !/^https:\/\/[^\s"']+$/.test(item.image_link!.trim())) issues.push('invalid_image_link');
  if (req('price') && !PRICE_RE.test(item.price!.trim())) issues.push('invalid_price');
  if (req('price') && PRICE_RE.test(item.price!.trim()) && parseFloat(item.price!) <= 0) issues.push('non_positive_price');
  if (req('availability') && !VALID_AVAILABILITY.has(item.availability!.trim())) issues.push('invalid_availability');
  if (isSandboxFixture({ id: item.id, slug: item.link, title: item.title })) issues.push('sandbox_fixture');

  return issues;
}

export interface FeedPartition<T> {
  valid: T[];
  rejected: Array<{ item: T; issues: string[] }>;
}

/** Split feed items into emittable and rejected sets. Never mutates input. */
export function partitionFeedItems<T extends FeedItemLike>(items: readonly T[]): FeedPartition<T> {
  const valid: T[] = [];
  const rejected: Array<{ item: T; issues: string[] }> = [];
  for (const item of items) {
    const issues = validateFeedItem(item);
    if (issues.length === 0) valid.push(item);
    else rejected.push({ item, issues });
  }
  return { valid, rejected };
}

// ── Canonical URL de-duplication ──────────────────────────────────────

export interface DedupeResult {
  unique: string[];
  duplicates: string[];
}

/** Stable de-duplication, first occurrence wins. */
export function dedupeCanonicalUrls(urls: readonly string[]): DedupeResult {
  const seen = new Set<string>();
  const unique: string[] = [];
  const duplicates: string[] = [];
  for (const raw of urls) {
    const url = String(raw ?? '').trim();
    if (!url) continue;
    if (seen.has(url)) {
      duplicates.push(url);
      continue;
    }
    seen.add(url);
    unique.push(url);
  }
  return { unique, duplicates };
}

/** Fail closed when a rendered urlset contains repeated <loc> values. */
export function assertNoDuplicateLocs(xml: string, label: string): void {
  const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
  const { duplicates } = dedupeCanonicalUrls(locs);
  if (duplicates.length > 0) {
    throw new Error(
      `[merchant-integrity] FATAL: ${label} contains ${duplicates.length} duplicate canonical URL(s): ` +
        `${Array.from(new Set(duplicates)).slice(0, 5).join(', ')}`
    );
  }
}

// ── Release gate ──────────────────────────────────────────────────────

export const ZERO_CATALOG_DIAGNOSTIC =
  '[merchant-integrity] FATAL: 0 eligible real products. ' +
  'Release is blocked. Sandbox fixtures, previous artifacts and static fallbacks are not substitutes — ' +
  'load a real eligible catalog and regenerate.';

/**
 * Strict release rule: zero eligible real products always fails closed.
 * No fallback products, no relaxation.
 */
export function assertReleasableCatalog(eligibleCount: number, label: string): void {
  if (!Number.isFinite(eligibleCount) || eligibleCount <= 0) {
    throw new Error(`${ZERO_CATALOG_DIAGNOSTIC} (context: ${label})`);
  }
}
