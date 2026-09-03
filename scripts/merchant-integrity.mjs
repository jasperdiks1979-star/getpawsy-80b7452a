/**
 * PHASE 10B — Merchant release integrity (Node mirror).
 *
 * Mirrors the fixture / duplicate-URL rules of
 * src/lib/merchant/releaseIntegrity.ts so the .mjs sitemap generator and the
 * TypeScript feed plugin apply exactly the same contract.
 *
 * The pattern list below MUST stay identical to SANDBOX_FIXTURE_PATTERNS in
 * the TypeScript module — src/test/merchant-release-integrity.test.ts fails
 * the build if they drift.
 */

export const SANDBOX_FIXTURE_PATTERNS = [
  /sandbox/i,
  /\bfixture\b/i,
  /\bdo[\s_-]*not[\s_-]*ship\b/i,
  /\btest[\s_-]*only\b/i,
  /\bplaceholder\b/i,
];

export function isSandboxFixture(candidate) {
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
    .filter((v) => typeof v === "string" && v.length > 0)
    .join(" ");
  if (!haystack) return false;
  return SANDBOX_FIXTURE_PATTERNS.some((re) => re.test(haystack));
}

export function excludeSandboxFixtures(items) {
  return (items || []).filter((item) => !isSandboxFixture(item));
}

// Mirror of src/lib/merchant/releaseIntegrity.ts: only identifying fields are
// scanned. Free-text descriptions legitimately contain prose such as
// "we do not ship on weekends" and must not be treated as fixture markers.
const IDENTIFYING_TAG_RE =
  /<(?:loc|link|title|g:id|g:mpn|g:item_group_id|g:brand)>([\s\S]*?)<\/(?:loc|link|title|g:id|g:mpn|g:item_group_id|g:brand)>/gi;

export function extractIdentifyingXmlText(xml) {
  const source = String(xml ?? "");
  const matches = [...source.matchAll(IDENTIFYING_TAG_RE)].map((m) => m[1]);
  return matches.length > 0 ? matches.join(" ") : source;
}

export function containsSandboxFixture(xml) {
  const haystack = extractIdentifyingXmlText(xml);
  return SANDBOX_FIXTURE_PATTERNS.some((re) => re.test(haystack));
}


export function assertNoSandboxFixtures(xml, label) {
  if (containsSandboxFixture(xml)) {
    throw new Error(
      `[merchant-integrity] FATAL: ${label} contains SANDBOX fixture content. ` +
        `Sandbox fixtures may never be written to public/ or dist/.`
    );
  }
}

export function dedupeCanonicalUrls(urls) {
  const seen = new Set();
  const unique = [];
  const duplicates = [];
  for (const raw of urls || []) {
    const url = String(raw ?? "").trim();
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

export function dedupeEntriesByLoc(entries) {
  const seen = new Set();
  const unique = [];
  const duplicates = [];
  for (const entry of entries || []) {
    const loc = String(entry?.loc ?? "").trim();
    if (!loc) continue;
    if (seen.has(loc)) {
      duplicates.push(loc);
      continue;
    }
    seen.add(loc);
    unique.push(entry);
  }
  return { unique, duplicates };
}

export function assertNoDuplicateLocs(xml, label) {
  const locs = Array.from(String(xml ?? "").matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
  const { duplicates } = dedupeCanonicalUrls(locs);
  if (duplicates.length > 0) {
    throw new Error(
      `[merchant-integrity] FATAL: ${label} contains ${duplicates.length} duplicate canonical URL(s): ` +
        `${Array.from(new Set(duplicates)).slice(0, 5).join(", ")}`
    );
  }
}

/** Generated outputs that must never be reused from a previous build. */
export const STALE_ARTIFACT_FILES = [
  "merchant-feed.xml",
  "google-shopping-feed.xml",
  "google-feed.xml",
  "sitemap.xml",
  "sitemap-pages.xml",
  "sitemap-products-1.xml",
  "sitemap-collections.xml",
  "sitemap-guides.xml",
  "sitemap-blog.xml",
];

export const ZERO_CATALOG_DIAGNOSTIC =
  "[merchant-integrity] FATAL: 0 eligible real products. " +
  "Release is blocked. Sandbox fixtures, previous artifacts and static fallbacks are not substitutes — " +
  "load a real eligible catalog and regenerate.";
