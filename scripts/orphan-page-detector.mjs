/**
 * orphan-page-detector.mjs
 * Scans the React codebase for all routable pages and cross-references them
 * against internal <Link> / <a> usage to flag pages with < 2 inbound links.
 *
 * Usage: node scripts/orphan-page-detector.mjs
 */

import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const REPORTS_DIR = path.join(process.cwd(), "reports");

function walk(dir, ext = ".tsx") {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files = files.concat(walk(full, ext));
    else if (entry.name.endsWith(ext)) files.push(full);
  }
  return files;
}

function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const allFiles = walk(SRC);

  // 1. Collect all defined routes from App.tsx / router files
  const routeRegex = /path\s*[:=]\s*["'`]([^"'`]+)["'`]/g;
  const definedPaths = new Set();
  for (const file of allFiles) {
    const code = fs.readFileSync(file, "utf8");
    let m;
    while ((m = routeRegex.exec(code)) !== null) {
      const p = m[1].replace(/:[^/]+/g, ":param");
      if (p.startsWith("/")) definedPaths.add(p);
    }
  }

  // 2. Collect all internal link targets across the codebase
  // Match: to="/path", href="/path", to={`/path`}, to={'/path'}
  const linkRegex = /(?:to|href)\s*=\s*(?:["'`]|{["'`])(\/?[a-z][a-z0-9\-/_]*)/gi;
  const inboundCount = {};
  const linkSources = {};

  for (const file of allFiles) {
    const code = fs.readFileSync(file, "utf8");
    const relPath = path.relative(SRC, file);
    let m;
    while ((m = linkRegex.exec(code)) !== null) {
      let target = m[1];
      if (!target.startsWith("/")) continue;
      // Normalize: strip trailing slash, collapse params
      target = target.replace(/\/+$/, "") || "/";
      inboundCount[target] = (inboundCount[target] || 0) + 1;
      if (!linkSources[target]) linkSources[target] = [];
      if (linkSources[target].length < 5) linkSources[target].push(relPath);
    }
  }

  // 3. Merge and flag
  const allPaths = new Set([...definedPaths, ...Object.keys(inboundCount)]);
  const orphans = [];
  const weakPages = [];

  for (const p of allPaths) {
    // Skip dynamic params, admin, and utility routes
    if (p.includes(":param") || p.startsWith("/admin") || p === "/cart" || p === "/checkout" || p === "/search") continue;

    const count = inboundCount[p] || 0;
    const entry = { path: p, inbound_links: count, sources: linkSources[p] || [] };
    if (count === 0) orphans.push(entry);
    else if (count < 2) weakPages.push(entry);
  }

  orphans.sort((a, b) => a.path.localeCompare(b.path));
  weakPages.sort((a, b) => a.inbound_links - b.inbound_links);

  const report = {
    generated_at: new Date().toISOString(),
    total_pages_scanned: allPaths.size,
    orphan_pages: orphans.length,
    weak_pages_under_2_links: weakPages.length,
    orphans,
    weak_pages: weakPages,
    recommendations: orphans.slice(0, 20).map(o => ({
      page: o.path,
      action: "Add to related content blocks, guide recommendations, or footer links",
      suggested_placements: [
        "RecommendedProductsBlock on guide pages",
        "RelatedGuidesBlock on product pages",
        "Footer navigation links",
        "Homepage featured section",
      ],
    })),
  };

  const outPath = path.join(REPORTS_DIR, "orphan-pages.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\n══════════════════════════════════════════");
  console.log("  Orphan Page Detection Report");
  console.log("══════════════════════════════════════════");
  console.log(`  Total pages scanned:      ${allPaths.size}`);
  console.log(`  Orphan pages (0 links):   ${orphans.length}`);
  console.log(`  Weak pages (<2 links):    ${weakPages.length}`);
  console.log(`  Report saved to:          ${outPath}`);
  console.log("══════════════════════════════════════════\n");

  if (orphans.length > 0) {
    console.log("Top orphan pages:");
    orphans.slice(0, 10).forEach(o => console.log(`  ⚠  ${o.path}`));
    console.log("");
  }
}

main();
