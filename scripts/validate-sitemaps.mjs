import fs from "node:fs";
import path from "node:path";
import { assertLooksLikeXml } from "./sitemap-utils.mjs";

const OUT_DIR = path.resolve(process.cwd(), "public");

function read(file) {
  const p = path.join(OUT_DIR, file);
  if (!fs.existsSync(p)) throw new Error(`Missing: ${file}`);
  return fs.readFileSync(p, "utf8");
}

function main() {
  console.log("\n══════════════════════════════════════════");
  console.log("  Sitemap Validation");
  console.log("══════════════════════════════════════════\n");

  const index = read("sitemap.xml");
  assertLooksLikeXml(index, "<sitemapindex");

  const p1 = read("sitemap-products-1.xml");
  assertLooksLikeXml(p1, "<urlset");
  if (!p1.includes("<url>")) throw new Error("sitemap-products-1.xml has 0 <url> entries.");

  console.log("  ✅ Sitemap validation OK\n");
  console.log("══════════════════════════════════════════\n");
}

main();
