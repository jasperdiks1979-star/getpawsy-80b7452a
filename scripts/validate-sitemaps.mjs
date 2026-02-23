import fs from "node:fs";
import path from "node:path";

const PUBLIC_DIR = path.join(process.cwd(), "public");

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function countTag(xml, tag) {
  const re = new RegExp(`<${tag}[\\s>]`, "g");
  return (xml.match(re) || []).length;
}

function extractLocs(xml) {
  const re = /<loc>(.*?)<\/loc>/g;
  const locs = [];
  let m;
  while ((m = re.exec(xml)) !== null) locs.push(m[1]);
  return locs;
}

function validateUrlset(filePath) {
  const xml = readFile(filePath);
  const name = path.basename(filePath);
  const errors = [];

  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
    errors.push(`${name}: Missing XML header`);
  }
  if (!xml.includes("<urlset")) errors.push(`${name}: Missing <urlset>`);
  if (!xml.includes("</urlset>")) errors.push(`${name}: Missing </urlset>`);
  if (xml.includes("<urlset/>") || xml.includes("<urlset />")) {
    errors.push(`${name}: Self-closing <urlset/> detected — must use explicit close tag`);
  }

  const urlCount = countTag(xml, "url");
  return { name, urlCount, errors };
}

function validateIndex(filePath) {
  const xml = readFile(filePath);
  const name = path.basename(filePath);
  const errors = [];

  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
    errors.push(`${name}: Missing XML header`);
  }
  if (!xml.includes("<sitemapindex")) errors.push(`${name}: Missing <sitemapindex>`);
  if (!xml.includes("</sitemapindex>")) errors.push(`${name}: Missing </sitemapindex>`);
  if (xml.includes("<sitemapindex/>") || xml.includes("<sitemapindex />")) {
    errors.push(`${name}: Self-closing <sitemapindex/> detected`);
  }

  const locs = extractLocs(xml);
  return { name, refs: locs, errors };
}

// Required files that MUST exist and be non-empty
const REQUIRED_FILES = [
  { file: "sitemap.xml", type: "index" },
  { file: "sitemap-products-1.xml", type: "urlset", minUrls: 1 },
];

function main() {
  console.log("\n══════════════════════════════════════════");
  console.log("  Sitemap Validation Report");
  console.log("══════════════════════════════════════════\n");

  const allErrors = [];
  let totalUrls = 0;
  const report = {};

  // ── Assert required files exist ──
  for (const req of REQUIRED_FILES) {
    const fp = path.join(PUBLIC_DIR, req.file);
    if (!fs.existsSync(fp)) {
      console.error(`FATAL: Required file ${req.file} does not exist in /public`);
      process.exit(1);
    }
  }

  // Validate sitemap index
  const indexPath = path.join(PUBLIC_DIR, "sitemap.xml");
  const indexResult = validateIndex(indexPath);
  allErrors.push(...indexResult.errors);

  // Check that every referenced sitemap file exists
  for (const loc of indexResult.refs) {
    const url = new URL(loc);
    const filename = path.basename(url.pathname);
    const filePath = path.join(PUBLIC_DIR, filename);
    if (!fs.existsSync(filePath)) {
      allErrors.push(`Index references ${filename} but file does not exist`);
    }
  }

  // Find and validate all urlset sitemaps
  const sitemapFiles = fs.readdirSync(PUBLIC_DIR)
    .filter((f) => f.startsWith("sitemap-") && f.endsWith(".xml"))
    .sort();

  for (const file of sitemapFiles) {
    const filePath = path.join(PUBLIC_DIR, file);
    const result = validateUrlset(filePath);
    allErrors.push(...result.errors);
    totalUrls += result.urlCount;

    // Categorize for report
    if (file.startsWith("sitemap-products")) {
      report[file] = result.urlCount;
    } else {
      const category = file.replace("sitemap-", "").replace(".xml", "");
      report[category] = result.urlCount;
    }
  }

  // ── Assert minimum URL counts for required files ──
  for (const req of REQUIRED_FILES) {
    if (req.type === "urlset" && req.minUrls) {
      const count = report[req.file] ?? 0;
      if (count < req.minUrls) {
        allErrors.push(`${req.file}: Has ${count} URLs but requires at least ${req.minUrls}. Product sitemap must not be empty.`);
      }
    }
  }

  // Print report
  for (const [key, count] of Object.entries(report)) {
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    console.log(`  ${label.padEnd(30)} ${count} URLs`);
  }
  console.log(`  ${"─".repeat(40)}`);
  console.log(`  ${"Total".padEnd(30)} ${totalUrls} URLs`);
  console.log(`  ${"Index refs".padEnd(30)} ${indexResult.refs.length}`);

  if (allErrors.length > 0) {
    console.log(`\n  ❌ ERRORS (${allErrors.length}):`);
    for (const e of allErrors) console.log(`     • ${e}`);
    console.log("\n  Status: INVALID — BUILD SHOULD FAIL\n");
    console.log("══════════════════════════════════════════\n");
    process.exit(1);
  }

  console.log("\n  Status: ✅ VALID");
  console.log("\n══════════════════════════════════════════\n");
}

main();
