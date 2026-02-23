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

  // 2. sitemap-products-1.xml — must be urlset with ≥1 <url>
  const p1 = read("sitemap-products-1.xml");
  assertLooksLikeXml(p1, "<urlset");
  if (!p1.includes("<url>")) throw new Error("sitemap-products-1.xml has 0 <url> entries.");

  // 3. Verify all product chunks referenced in sitemap.xml actually exist
  const refs = index.match(/sitemap-products-\d+\.xml/g) || [];
  for (const ref of refs) {
    const fp = path.join(OUT_DIR, ref);
    if (!fs.existsSync(fp)) throw new Error(`sitemap.xml references ${ref} but file is missing.`);
    const body = fs.readFileSync(fp, "utf8");
    assertLooksLikeXml(body, "<urlset");
    if (!body.includes("<url>")) throw new Error(`${ref} has 0 <url> entries.`);
  }

  // 4. Verify no stale product chunks exist that aren't referenced
  const allFiles = fs.readdirSync(OUT_DIR);
  for (const f of allFiles) {
    if (/^sitemap-products-\d+\.xml$/.test(f) && !refs.includes(f)) {
      throw new Error(`Stale product chunk ${f} exists but is not referenced in sitemap.xml.`);
    }
  }

  console.log(`  ✅ sitemap.xml: ${sitemapCount} <sitemap> entries`);
  console.log(`  ✅ sitemap-products-1.xml: valid urlset`);
  console.log(`  ✅ All referenced chunks verified`);
  console.log("  ✅ Sitemap validation OK\n");
  console.log("══════════════════════════════════════════\n");
}

main();
