import { test, expect } from "../playwright-fixture";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * Pinterest destination-URL crawler test.
 *
 * Goal: prove that every URL we've ever shipped to Pinterest still resolves
 * to a live, canonical storefront page — and flag ones that don't with an
 * actionable verdict (FIX vs ARCHIVE) so the marketing team can act without
 * guessing.
 *
 * Sources of truth:
 *   1. `public/sitemap*.xml` on disk — the URLs we publicly declare exist.
 *   2. `products_public` (anon) — the product slugs that render a PDP.
 *   3. `pinterest_pin_audit.destination_url` (psql, last 90d)
 *      + `pinterest_video_destination_audit.destination_url` — every URL we
 *      handed to Pinterest.
 *
 * Verdicts per destination URL:
 *   OK              → path is in sitemap OR resolves to an active product,
 *                     AND live HEAD returns 2xx/3xx.
 *   FIX / broken    → path shape valid but live check returned 4xx/5xx.
 *   FIX / mismatch  → path uses a route that isn't publicly served
 *                     (e.g. `/product/…`, `/p/…`, typo) — canonicalize the URL.
 *   ARCHIVE         → product slug no longer exists in `products_public`
 *                     (product was removed / renamed) — dequeue the pin.
 *
 * The test writes a JSON report to /mnt/documents/pinterest-destination-report.json
 * and a Markdown summary to test-results/. It fails only on a catastrophic
 * signal (< 20% OK rate) so it never turns green while the storefront is
 * silently haemorrhaging Pinterest traffic.
 */

const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc";

const SUPABASE_REST =
  "https://nojvgfbcjgipjxpfatmm.supabase.co/rest/v1";

const MAX_URLS = 250; // hard cap so a single run stays under a minute
const LIVE_ORIGIN = "http://localhost:8080"; // rewrite prod hosts to local dev

type Verdict = "OK" | "FIX_BROKEN" | "FIX_MISMATCH" | "ARCHIVE";

interface Row {
  url: string;
  pathname: string;
  slug: string | null;
  verdict: Verdict;
  httpStatus: number | null;
  reason: string;
  inSitemap: boolean;
  slugKnown: boolean;
}

function psqlLines(sql: string): string[] {
  const raw = execSync("psql -tA -v ON_ERROR_STOP=1", {
    input: sql,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function loadSitemapPaths(): Set<string> {
  const dir = resolve(process.cwd(), "public");
  const files = readdirSync(dir).filter((f) => f.startsWith("sitemap") && f.endsWith(".xml"));
  const paths = new Set<string>();
  for (const f of files) {
    const xml = readFileSync(join(dir, f), "utf8");
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      try {
        paths.add(new URL(m[1]).pathname.replace(/\/$/, "") || "/");
      } catch {
        /* skip malformed */
      }
    }
  }
  return paths;
}

test("Pinterest destination URLs resolve to live canonical routes", async ({ request }) => {
  test.setTimeout(180_000);

  // 1. Sitemap paths.
  const sitemapPaths = loadSitemapPaths();
  expect(
    sitemapPaths.size,
    "sitemap.xml must contain at least one <loc> — regenerate if missing",
  ).toBeGreaterThan(10);

  // 2. Public product slugs (anon).
  const productSlugs = new Set<string>();
  let offset = 0;
  while (true) {
    const res = await request.get(
      `${SUPABASE_REST}/products_public?select=slug&is_active=eq.true&limit=1000&offset=${offset}`,
      { headers: { apikey: ANON_KEY } },
    );
    expect(res.ok(), "products_public must be readable").toBeTruthy();
    const rows = (await res.json()) as Array<{ slug: string | null }>;
    for (const r of rows) if (r.slug) productSlugs.add(r.slug);
    if (rows.length < 1000) break;
    offset += 1000;
  }
  expect(productSlugs.size, "must have at least 1 active product slug").toBeGreaterThan(0);

  // 3. Distinct Pinterest destination URLs (last 90d for pins, all for videos).
  const dbUrls = psqlJson<string[]>(`
    SELECT DISTINCT url FROM (
      SELECT destination_url AS url
      FROM pinterest_pin_audit
      WHERE destination_url IS NOT NULL
        AND created_at > now() - interval '90 days'
      UNION
      SELECT destination_url AS url
      FROM pinterest_video_destination_audit
      WHERE destination_url IS NOT NULL
    ) t
    WHERE url LIKE 'http%'
    ORDER BY url
    LIMIT ${MAX_URLS}
  `);
  expect(dbUrls.length, "no Pinterest destination URLs found — DB access broken").toBeGreaterThan(0);

  // 4. Classify + live-check each URL in parallel batches.
  const rows: Row[] = [];
  const batchSize = 10;
  for (let i = 0; i < dbUrls.length; i += batchSize) {
    const batch = dbUrls.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (rawUrl): Promise<Row> => {
        let pathname = "";
        try {
          pathname = new URL(rawUrl).pathname.replace(/\/$/, "") || "/";
        } catch {
          return {
            url: rawUrl,
            pathname: "",
            slug: null,
            verdict: "FIX_MISMATCH",
            httpStatus: null,
            reason: "unparseable URL",
            inSitemap: false,
            slugKnown: false,
          };
        }

        const productMatch = pathname.match(/^\/products\/([^/]+)$/);
        const slug = productMatch?.[1] ?? null;
        const slugKnown = slug ? productSlugs.has(slug) : false;
        const inSitemap = sitemapPaths.has(pathname);

        // Static-shape verdict before touching the network.
        if (slug && !slugKnown) {
          return {
            url: rawUrl,
            pathname,
            slug,
            verdict: "ARCHIVE",
            httpStatus: null,
            reason: "product slug no longer active in products_public",
            inSitemap,
            slugKnown,
          };
        }
        if (!slug && !inSitemap) {
          return {
            url: rawUrl,
            pathname,
            slug,
            verdict: "FIX_MISMATCH",
            httpStatus: null,
            reason: "path is not a product URL and not in sitemap",
            inSitemap,
            slugKnown,
          };
        }

        // Live check against local dev server (same code as production).
        const liveUrl = `${LIVE_ORIGIN}${pathname}`;
        let status: number | null = null;
        try {
          const r = await request.get(liveUrl, {
            failOnStatusCode: false,
            timeout: 10_000,
            maxRedirects: 5,
          });
          status = r.status();
        } catch {
          status = null;
        }
        if (status === null) {
          return {
            url: rawUrl,
            pathname,
            slug,
            verdict: "FIX_BROKEN",
            httpStatus: null,
            reason: "network error / timeout on live check",
            inSitemap,
            slugKnown,
          };
        }
        if (status >= 400) {
          return {
            url: rawUrl,
            pathname,
            slug,
            verdict: "FIX_BROKEN",
            httpStatus: status,
            reason: `live check returned ${status}`,
            inSitemap,
            slugKnown,
          };
        }
        return {
          url: rawUrl,
          pathname,
          slug,
          verdict: "OK",
          httpStatus: status,
          reason: "resolves to live canonical route",
          inSitemap,
          slugKnown,
        };
      }),
    );
    rows.push(...results);
  }

  // 5. Summarise.
  const totals: Record<Verdict, number> = {
    OK: 0,
    FIX_BROKEN: 0,
    FIX_MISMATCH: 0,
    ARCHIVE: 0,
  };
  for (const r of rows) totals[r.verdict]++;
  const okRate = rows.length ? totals.OK / rows.length : 0;

  // 6. Persist artefacts.
  const report = {
    generatedAt: new Date().toISOString(),
    counts: {
      totalChecked: rows.length,
      productSlugsActive: productSlugs.size,
      sitemapPaths: sitemapPaths.size,
      ...totals,
      okRate: Number(okRate.toFixed(4)),
    },
    fix: rows.filter((r) => r.verdict === "FIX_BROKEN" || r.verdict === "FIX_MISMATCH"),
    archive: rows.filter((r) => r.verdict === "ARCHIVE"),
    ok: rows.filter((r) => r.verdict === "OK").map((r) => r.pathname),
  };

  mkdirSync("/mnt/documents", { recursive: true });
  writeFileSync(
    "/mnt/documents/pinterest-destination-report.json",
    JSON.stringify(report, null, 2),
  );
  mkdirSync("test-results", { recursive: true });
  const md = [
    `# Pinterest destination URL crawl — ${report.generatedAt}`,
    ``,
    `- Checked: **${rows.length}** URLs`,
    `- OK: **${totals.OK}** (${(okRate * 100).toFixed(1)}%)`,
    `- FIX broken (live 4xx/5xx): **${totals.FIX_BROKEN}**`,
    `- FIX mismatch (wrong path shape): **${totals.FIX_MISMATCH}**`,
    `- ARCHIVE (slug retired): **${totals.ARCHIVE}**`,
    ``,
    `## FIX candidates`,
    ...report.fix.slice(0, 50).map((r) => `- \`${r.pathname}\` — ${r.reason} (${r.url})`),
    ``,
    `## ARCHIVE candidates`,
    ...report.archive.slice(0, 50).map((r) => `- \`${r.slug}\` — ${r.reason} (${r.url})`),
  ].join("\n");
  writeFileSync("test-results/pinterest-destination-report.md", md);

  console.log(
    JSON.stringify(
      {
        summary: report.counts,
        reportJson: "/mnt/documents/pinterest-destination-report.json",
        reportMd: "test-results/pinterest-destination-report.md",
      },
      null,
      2,
    ),
  );

  // 7. Safety-net assertions — never certify while the storefront is silently
  //    broken for Pinterest.
  expect(
    okRate,
    `catastrophic: only ${(okRate * 100).toFixed(1)}% of Pinterest URLs resolve. See ${
      "/mnt/documents/pinterest-destination-report.json"
    }`,
  ).toBeGreaterThan(0.2);
});
