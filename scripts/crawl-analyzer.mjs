/**
 * crawl-analyzer.mjs — Simulate internal link graph and report crawl depth issues.
 * Reads sitemap data and known internal link mappings to identify orphans and weak pages.
 */

import fs from "node:fs";
import path from "node:path";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const REPORTS_DIR = path.join(process.cwd(), "reports");
const BASE = "https://getpawsy.pet";

function extractLocs(xml) {
  const re = /<loc>(.*?)<\/loc>/g;
  const locs = [];
  let m;
  while ((m = re.exec(xml)) !== null) locs.push(m[1]);
  return locs;
}

function toPath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}

function main() {
  // ── Collect all sitemap URLs ──
  const sitemapFiles = fs.readdirSync(PUBLIC_DIR)
    .filter((f) => f.startsWith("sitemap-") && f.endsWith(".xml") && !f.includes("index"))
    .sort();

  const allPaths = new Set();
  for (const file of sitemapFiles) {
    const xml = fs.readFileSync(path.join(PUBLIC_DIR, file), "utf8");
    for (const loc of extractLocs(xml)) {
      allPaths.add(toPath(loc));
    }
  }

  // ── Build adjacency graph from known structural links ──
  // Homepage links to top-level pages
  const inbound = {};
  const depth = {};
  for (const p of allPaths) {
    inbound[p] = 0;
    depth[p] = Infinity;
  }

  // Simulate structural links
  const homepage = "/";
  depth[homepage] = 0;

  const topLevel = ["/products", "/blog", "/guides", "/bestsellers", "/collections"];
  const structuralLinks = [];

  // Homepage → top-level
  for (const tl of topLevel) {
    structuralLinks.push([homepage, tl]);
  }

  // /products → each product
  for (const p of allPaths) {
    if (p.startsWith("/product/")) structuralLinks.push(["/products", p]);
  }
  // /blog → each blog post
  for (const p of allPaths) {
    if (p.startsWith("/blog/") && p !== "/blog") structuralLinks.push(["/blog", p]);
  }
  // /guides → each guide
  for (const p of allPaths) {
    if (p.startsWith("/guides/") && p !== "/guides") structuralLinks.push(["/guides", p]);
  }
  // /collections → each collection
  for (const p of allPaths) {
    if (p.startsWith("/collections/")) structuralLinks.push(["/products", p]);
  }
  // Collection → products (approximate: all collections link to /products listing)
  // Guides → related products (approximate)

  // Apply links
  for (const [from, to] of structuralLinks) {
    if (inbound[to] !== undefined) inbound[to]++;
    // BFS depth
    const fromDepth = depth[from] !== undefined ? depth[from] : Infinity;
    if (fromDepth + 1 < (depth[to] ?? Infinity)) {
      depth[to] = fromDepth + 1;
    }
  }

  // ── Classify ──
  const depth1 = [], depth2 = [], depth3plus = [], orphans = [], lowLinks = [];

  for (const p of allPaths) {
    const d = depth[p] ?? Infinity;
    const links = inbound[p] ?? 0;

    if (d === Infinity && p !== homepage) orphans.push(p);
    else if (d === 1) depth1.push(p);
    else if (d === 2) depth2.push(p);
    else if (d >= 3) depth3plus.push(p);

    if (links < 3 && p !== homepage) lowLinks.push({ path: p, inbound: links, depth: d });
  }

  // Sort for deterministic output
  orphans.sort();
  lowLinks.sort((a, b) => a.path.localeCompare(b.path));

  // ── Report ──
  const report = {
    generated_at: new Date().toISOString(),
    total_urls: allPaths.size,
    depth_1: depth1.length,
    depth_2: depth2.length,
    depth_3_plus: depth3plus.length,
    orphan_count: orphans.length,
    orphan_urls: orphans.slice(0, 50),
    low_inbound_count: lowLinks.length,
    low_inbound_urls: lowLinks.slice(0, 50),
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORTS_DIR, "crawl-report.json"), JSON.stringify(report, null, 2), "utf8");

  console.log("\n══════════════════════════════════════════");
  console.log("  Crawl Depth Report");
  console.log("══════════════════════════════════════════");
  console.log(`  Total URLs:              ${allPaths.size}`);
  console.log(`  URLs depth 1:            ${depth1.length}`);
  console.log(`  URLs depth 2:            ${depth2.length}`);
  console.log(`  URLs depth 3+:           ${depth3plus.length}`);
  console.log(`  Orphan URLs:             ${orphans.length}`);
  console.log(`  Low internal links (<3): ${lowLinks.length}`);
  console.log("══════════════════════════════════════════\n");

  if (orphans.length > 0) {
    console.log("  ⚠️  Orphan pages (no inbound links):");
    for (const o of orphans.slice(0, 10)) console.log(`     → ${o}`);
    if (orphans.length > 10) console.log(`     ... and ${orphans.length - 10} more`);
    console.log("");
  }

  if (lowLinks.length > 0) {
    const suggestions = lowLinks
      .filter((l) => l.depth >= 3 || l.depth === Infinity)
      .slice(0, 5);
    if (suggestions.length > 0) {
      console.log("  💡 Consider adding homepage or hub links to:");
      for (const s of suggestions) console.log(`     → ${s.path} (inbound: ${s.inbound}, depth: ${s.depth === Infinity ? "∞" : s.depth})`);
      console.log("");
    }
  }
}

main();
