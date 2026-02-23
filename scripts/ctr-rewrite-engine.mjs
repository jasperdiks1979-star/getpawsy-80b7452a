/**
 * ctr-rewrite-engine.mjs
 * Generates high-CTR title/meta variants for URLs with underperforming CTR.
 * Suggestion only — no auto-deployment.
 */
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const REPORTS_DIR = path.join(process.cwd(), "reports");

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }

// Expected CTR benchmarks by position (approximate industry averages)
const CTR_BENCHMARKS = {
  1: 28, 2: 15, 3: 11, 4: 8, 5: 6.5, 6: 5, 7: 4, 8: 3.2, 9: 2.5, 10: 2,
};

function getBenchmarkCtr(position) {
  const rounded = Math.round(position);
  return CTR_BENCHMARKS[rounded] || (rounded > 10 ? 1.5 : 30);
}

function extractKeyword(urlPath) {
  // Extract meaningful keyword from URL path
  return urlPath
    .replace(/^\/(product|blog|collections|guides)\//, "")
    .replace(/-\d+$/, "") // remove trailing IDs
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
    .slice(0, 50);
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}

function generateTitleVariants(keyword, position, urlPath) {
  const year = new Date().getFullYear();
  const isProduct = urlPath.startsWith("/product/");
  const isBlog = urlPath.startsWith("/blog/");
  const isCollection = urlPath.startsWith("/collections/");

  const variants = [];

  // Formula A: Primary Keyword + Benefit + Urgency + Year
  if (isProduct) {
    variants.push(truncate(`${keyword} — Premium Quality | Free US Shipping ${year}`, 60));
  } else if (isBlog) {
    variants.push(truncate(`${keyword}: Complete Guide for Pet Owners (${year})`, 60));
  } else {
    variants.push(truncate(`Best ${keyword} — Top Picks ${year} | Free Shipping`, 60));
  }

  // Formula B: Emotional Trigger + Solution + Social Proof
  if (isProduct) {
    variants.push(truncate(`Your Pet Deserves the Best ${keyword} — 5★ Rated`, 60));
  } else {
    variants.push(truncate(`Why Pet Owners Love These ${keyword} — Expert Picks`, 60));
  }

  // Formula C: Comparison + Outcome + Trust Signal
  variants.push(truncate(`${keyword} — Compare Top Options | US Warehouse`, 60));

  return variants;
}

function generateMetaVariants(keyword, urlPath) {
  const isProduct = urlPath.startsWith("/product/");

  const metas = [];

  if (isProduct) {
    metas.push(truncate(
      `Shop premium ${keyword.toLowerCase()} with fast US shipping. Trusted by thousands of happy pet owners. Order today and see the difference!`, 160
    ));
    metas.push(truncate(
      `Looking for the best ${keyword.toLowerCase()}? Ships from US warehouse in 2-5 business days. 30-day satisfaction guarantee included.`, 160
    ));
  } else {
    metas.push(truncate(
      `Discover the top ${keyword.toLowerCase()} for your pet. Expert-curated selection with honest reviews. Free shipping on qualifying orders.`, 160
    ));
    metas.push(truncate(
      `Complete guide to choosing the right ${keyword.toLowerCase()}. Compare features, prices, and quality. Updated for ${new Date().getFullYear()}.`, 160
    ));
  }

  return metas;
}

function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const gsc = readJson(path.join(DATA_DIR, "gsc-metrics.json"));
  if (!gsc || !Array.isArray(gsc.rows)) {
    console.warn("[ctr-rewrite] No GSC data. Skipping.");
    return;
  }

  const candidates = [];

  for (const row of gsc.rows) {
    let urlPath;
    try { urlPath = new URL(row.page).pathname; } catch { continue; }

    const position = row.position || 50;
    const ctr = row.ctr || 0;
    const impressions = row.impressions || 0;

    // Only target position 2–8 with meaningful impressions
    if (position < 2 || position > 8) continue;
    if (impressions < 30) continue;

    const benchmark = getBenchmarkCtr(position);
    if (ctr >= benchmark) continue; // Already performing well

    const keyword = extractKeyword(urlPath);
    const ctrGap = Math.round((benchmark - ctr) * 100) / 100;

    const titleVariants = generateTitleVariants(keyword, position, urlPath);
    const metaVariants = generateMetaVariants(keyword, urlPath);

    // Impact scoring
    const potentialExtraClicks = Math.round(impressions * (ctrGap / 100));
    const impact = potentialExtraClicks > 50 ? "high" : potentialExtraClicks > 10 ? "medium" : "low";

    candidates.push({
      url: urlPath,
      position: Math.round(position * 10) / 10,
      current_ctr: ctr,
      benchmark_ctr: benchmark,
      ctr_gap: ctrGap,
      impressions,
      potential_extra_clicks: potentialExtraClicks,
      impact,
      title_variants: titleVariants,
      meta_variants: metaVariants,
    });
  }

  candidates.sort((a, b) => b.potential_extra_clicks - a.potential_extra_clicks);

  const highImpact = candidates.filter((c) => c.impact === "high").length;
  const totalVariants = candidates.length * 3;

  const report = {
    generated_at: new Date().toISOString(),
    low_ctr_urls: candidates.length,
    title_variants_generated: totalVariants,
    high_impact_candidates: highImpact,
    candidates,
  };

  fs.writeFileSync(path.join(REPORTS_DIR, "ctr-variants.json"), JSON.stringify(report, null, 2), "utf8");

  console.log("\n══════════════════════════════════════════");
  console.log("  CTR Optimization Opportunities");
  console.log("══════════════════════════════════════════");
  console.log(`  Low CTR URLs:            ${candidates.length}`);
  console.log(`  Title variants generated: ${totalVariants}`);
  console.log(`  High impact candidates:  ${highImpact}`);
  console.log("══════════════════════════════════════════\n");

  if (candidates.length > 0) {
    console.log("  Top opportunities:");
    for (const c of candidates.slice(0, 5)) {
      console.log(`    ${c.url} — pos ${c.position}, CTR ${c.current_ctr}% → ${c.benchmark_ctr}% (+${c.potential_extra_clicks} clicks)`);
    }
    console.log("");
  }
}

main();
