/**
 * internal-link-suggester.mjs
 * Detects weak pages and generates structured internal link recommendations.
 * Does NOT auto-insert links — output only.
 */

import fs from "node:fs";
import path from "node:path";

const REPORTS_DIR = path.join(process.cwd(), "reports");
const DATA_DIR = path.join(process.cwd(), "data");

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; }
}

function tokenize(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 2);
}

function similarity(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setB = new Set(tokensB);
  const overlap = tokensA.filter((t) => setB.has(t)).length;
  return overlap / Math.max(tokensA.length, tokensB.length);
}

function slugToTitle(slug) {
  return String(slug || "")
    .replace(/^\/[^/]+\//, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 60);
}

function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  // Load crawl report
  const crawlReport = readJson(path.join(REPORTS_DIR, "crawl-report.json"));
  if (!crawlReport) {
    console.warn("[link-suggester] No crawl-report.json found. Run crawl-analyzer first.");
    return;
  }

  // Load GSC metrics if available
  const gscMetrics = readJson(path.join(DATA_DIR, "gsc-metrics.json"));
  const gscByUrl = {};
  if (gscMetrics && Array.isArray(gscMetrics.rows)) {
    for (const row of gscMetrics.rows) {
      const p = row.page ? new URL(row.page).pathname : null;
      if (p) gscByUrl[p] = row;
    }
  }

  // Load all page data
  const collections = readJson(path.join(DATA_DIR, "collections.json")) || [];
  const products = readJson(path.join(DATA_DIR, "products.json")) || [];
  const blog = readJson(path.join(DATA_DIR, "blog.json")) || [];
  const guides = readJson(path.join(DATA_DIR, "guides.json")) || [];
  const clusters = readJson(path.join(DATA_DIR, "clusters.json")) || [];

  // Build all pages with tokens for similarity matching
  const allPages = [];
  const addPages = (entries, type) => {
    for (const e of entries) {
      if (!e.path) continue;
      allPages.push({
        path: e.path,
        type,
        tokens: tokenize(e.path),
        title: slugToTitle(e.path),
      });
    }
  };
  addPages(collections, "collection");
  addPages(products, "product");
  addPages(blog, "blog");
  addPages(guides, "guide");
  addPages(clusters, "cluster");

  // Identify weak pages
  const orphans = new Set(crawlReport.orphan_urls || []);
  const lowInbound = new Map();
  for (const item of crawlReport.low_inbound_urls || []) {
    lowInbound.set(item.path, item);
  }

  const weakPages = [];
  for (const page of allPages) {
    const isOrphan = orphans.has(page.path);
    const lowLink = lowInbound.get(page.path);
    const gsc = gscByUrl[page.path];
    const hasImpressions = gsc && gsc.impressions > 50;
    const isAuthorityCandidate = hasImpressions && (isOrphan || (lowLink && lowLink.inbound < 3));

    if (isOrphan || lowLink || isAuthorityCandidate) {
      weakPages.push({
        path: page.path,
        type: page.type,
        tokens: page.tokens,
        title: page.title,
        isOrphan,
        inbound: lowLink?.inbound ?? 0,
        depth: lowLink?.depth ?? (isOrphan ? Infinity : null),
        impressions: gsc?.impressions ?? 0,
        clicks: gsc?.clicks ?? 0,
        position: gsc?.position ?? null,
        isAuthorityCandidate: !!isAuthorityCandidate,
      });
    }
  }

  // For each weak page, find related pages and generate suggestions
  const suggestions = [];
  let totalSuggestedLinks = 0;

  for (const weak of weakPages) {
    // Score all other pages by similarity
    const scored = allPages
      .filter((p) => p.path !== weak.path)
      .map((p) => ({ ...p, score: similarity(weak.tokens, p.tokens) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const linkSuggestions = scored
      .filter((s) => s.score > 0.1)
      .map((s) => {
        const anchorVariations = [
          { type: "exact", text: weak.title },
          { type: "partial", text: weak.title.split(" ").slice(0, 3).join(" ") },
          { type: "semantic", text: `Best ${weak.type === "product" ? "deals on" : "guide to"} ${weak.title.split(" ").slice(0, 2).join(" ").toLowerCase()}` },
        ];

        let placement = "blog contextual link";
        if (s.type === "guide") placement = "related guide";
        else if (s.type === "cluster") placement = "cluster article";
        else if (s.type === "collection") placement = "collection description";
        else if (s.path === "/") placement = "homepage section";

        return {
          source_url: s.path,
          source_type: s.type,
          similarity: Math.round(s.score * 100) / 100,
          anchor_variations: anchorVariations,
          recommended_placement: placement,
        };
      });

    totalSuggestedLinks += linkSuggestions.length;

    suggestions.push({
      target_url: weak.path,
      target_type: weak.type,
      is_orphan: weak.isOrphan,
      inbound_links: weak.inbound,
      crawl_depth: weak.depth === Infinity ? "orphan" : weak.depth,
      impressions: weak.impressions,
      is_authority_candidate: weak.isAuthorityCandidate,
      suggested_links: linkSuggestions,
    });
  }

  const highRevenue = suggestions.filter((s) => s.is_authority_candidate);

  // Save report
  const report = {
    generated_at: new Date().toISOString(),
    weak_pages_detected: weakPages.length,
    high_revenue_needing_boost: highRevenue.length,
    total_suggested_links: totalSuggestedLinks,
    suggestions,
  };

  fs.writeFileSync(
    path.join(REPORTS_DIR, "internal-link-suggestions.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );

  console.log("\n══════════════════════════════════════════");
  console.log("  Internal Link Suggestions");
  console.log("══════════════════════════════════════════");
  console.log(`  Weak pages detected:            ${weakPages.length}`);
  console.log(`  High revenue pages needing boost: ${highRevenue.length}`);
  console.log(`  Suggested new contextual links:  ${totalSuggestedLinks}`);
  console.log("══════════════════════════════════════════\n");
}

main();
