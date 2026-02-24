import fs from "node:fs";
import path from "node:path";
import { assertLooksLikeXml } from "./sitemap-utils.mjs";

// Support --dist flag to validate /dist instead of /public
const useDistDir = process.argv.includes("--dist");
const OUT_DIR = path.resolve(process.cwd(), useDistDir ? "dist" : "public");

function read(file) {
  const p = path.join(OUT_DIR, file);
  if (!fs.existsSync(p)) throw new Error(`Missing: ${file} (looked in ${OUT_DIR})`);
  return fs.readFileSync(p, "utf8");
}

function main() {
  console.log("\n══════════════════════════════════════════");
  console.log(`  Sitemap Validation (${useDistDir ? "dist" : "public"})`);
  console.log("══════════════════════════════════════════\n");

  // 1. sitemap.xml — must be sitemapindex with ≥2 <sitemap> entries
  const index = read("sitemap.xml");
  assertLooksLikeXml(index, "<sitemapindex");
  const sitemapCount = (index.match(/<sitemap>/g) || []).length;
  if (sitemapCount < 2) throw new Error(`sitemap.xml has only ${sitemapCount} <sitemap> entries (need ≥2).`);

  // 2. Tiered product sitemaps
  const hasCoreProducts = fs.existsSync(path.join(OUT_DIR, "sitemap-core-products.xml"));
  const hasSecondaryProducts = fs.existsSync(path.join(OUT_DIR, "sitemap-secondary-products.xml"));

  if (hasCoreProducts) {
    const core = read("sitemap-core-products.xml");
    assertLooksLikeXml(core, "<urlset");
    if (!core.includes("<url>")) throw new Error("sitemap-core-products.xml has 0 <url> entries.");
    console.log(`  ✅ sitemap-core-products.xml: valid urlset`);
  }

  if (hasSecondaryProducts) {
    const secondary = read("sitemap-secondary-products.xml");
    assertLooksLikeXml(secondary, "<urlset");
    if (!secondary.includes("<url>")) throw new Error("sitemap-secondary-products.xml has 0 <url> entries.");
    console.log(`  ✅ sitemap-secondary-products.xml: valid urlset`);
  }

  if (!hasCoreProducts && !hasSecondaryProducts) {
    // Fallback: check legacy sitemap-products-1.xml
    const p1 = read("sitemap-products-1.xml");
    assertLooksLikeXml(p1, "<urlset");
    if (!p1.includes("<url>")) throw new Error("sitemap-products-1.xml has 0 <url> entries.");
    console.log(`  ✅ sitemap-products-1.xml: valid urlset (legacy)`);
  }

  // 3. Verify all referenced sitemaps in index actually exist
  const refs = index.match(/sitemap-[a-z-]+(?:-\d+)?\.xml/g) || [];
  for (const ref of refs) {
    const fp = path.join(OUT_DIR, ref);
    if (!fs.existsSync(fp)) throw new Error(`sitemap.xml references ${ref} but file is missing.`);
    const body = fs.readFileSync(fp, "utf8");
    assertLooksLikeXml(body, "<urlset");
    if (!body.includes("<url>")) throw new Error(`${ref} has 0 <url> entries.`);
  }

  // 4. Verify no stale legacy product chunks exist
  const allFiles = fs.readdirSync(OUT_DIR);
  for (const f of allFiles) {
    if (/^sitemap-products-\d+\.xml$/.test(f)) {
      console.warn(`  ⚠️  Legacy chunk ${f} still exists — should be removed after tier migration`);
    }
  }

  console.log(`  ✅ sitemap.xml: ${sitemapCount} <sitemap> entries`);
  console.log(`  ✅ All referenced sitemaps verified`);
  console.log("  ✅ Sitemap validation OK\n");
  console.log("══════════════════════════════════════════\n");
}

main();
