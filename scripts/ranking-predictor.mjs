/**
 * ranking-predictor.mjs
 * Predicts ranking movement probability per URL using GSC data + crawl metrics.
 * Output only — no automatic modifications.
 */
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const REPORTS_DIR = path.join(process.cwd(), "reports");

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }

function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const gsc = readJson(path.join(DATA_DIR, "gsc-metrics.json"));
  const crawlReport = readJson(path.join(REPORTS_DIR, "crawl-report.json"));
  const linkSuggestions = readJson(path.join(REPORTS_DIR, "internal-link-suggestions.json"));

  if (!gsc || !Array.isArray(gsc.rows) || gsc.rows.length === 0) {
    console.warn("[ranking-predictor] No GSC data available. Skipping.");
    return;
  }

  // Build crawl depth + inbound maps
  const orphans = new Set(crawlReport?.orphan_urls || []);
  const lowInbound = new Map();
  for (const item of (crawlReport?.low_inbound_urls || [])) {
    lowInbound.set(item.path, item);
  }

  const predictions = [];
  let stable = 0, atRisk = 0, growth = 0, dropRisk = 0;

  for (const row of gsc.rows) {
    let urlPath;
    try { urlPath = new URL(row.page).pathname; } catch { continue; }

    const position = row.position || 50;
    const impressions = row.impressions || 0;
    const clicks = row.clicks || 0;
    const ctr = row.ctr || 0;

    // Inbound link strength
    const inboundInfo = lowInbound.get(urlPath);
    const inboundCount = inboundInfo ? inboundInfo.inbound : 5; // assume decent if not in low list
    const isOrphan = orphans.has(urlPath);
    const crawlDepth = inboundInfo?.depth ?? (isOrphan ? 99 : 2);

    // ── Scoring model ──
    // Position quality (lower is better)
    const posScore = position <= 3 ? 90 : position <= 8 ? 70 : position <= 15 ? 50 : position <= 30 ? 30 : 10;

    // CTR quality relative to position benchmark
    const expectedCtr = position <= 1 ? 30 : position <= 3 ? 15 : position <= 5 ? 8 : position <= 10 ? 3 : 1;
    const ctrDelta = ctr - expectedCtr;
    const ctrScore = ctrDelta > 2 ? 80 : ctrDelta > 0 ? 60 : ctrDelta > -2 ? 40 : 20;

    // Impression momentum (higher = more visible)
    const impScore = impressions > 1000 ? 80 : impressions > 200 ? 60 : impressions > 50 ? 40 : 20;

    // Internal link authority
    const linkScore = isOrphan ? 5 : inboundCount >= 5 ? 80 : inboundCount >= 3 ? 60 : 30;

    // Crawl accessibility
    const depthScore = crawlDepth <= 2 ? 90 : crawlDepth <= 3 ? 60 : 20;

    // Composite scores
    const stabilityScore = Math.round((posScore * 0.3 + ctrScore * 0.2 + impScore * 0.2 + linkScore * 0.2 + depthScore * 0.1));
    const improvementProb = Math.round(Math.min(95, Math.max(5,
      (position > 3 ? 40 : 10) + (ctrDelta < 0 ? 15 : 0) + (linkScore < 60 ? 15 : 0) + (impressions > 100 ? 10 : 0)
    )));
    const dropProb = Math.round(Math.min(90, Math.max(5,
      (isOrphan ? 30 : 0) + (inboundCount < 3 ? 20 : 0) + (crawlDepth > 3 ? 15 : 0) + (ctrDelta < -5 ? 15 : 0)
    )));

    // Classification
    let classification;
    if (stabilityScore >= 70 && dropProb < 20) { classification = "Stable"; stable++; }
    else if (dropProb >= 40) { classification = "At Risk"; atRisk++; }
    else if (improvementProb >= 50 && position > 5) { classification = "Growth Opportunity"; growth++; }
    else if (position <= 3 && stabilityScore >= 60) { classification = "Authority Locked"; stable++; }
    else if (dropProb >= 30) { classification = "At Risk"; atRisk++; dropRisk++; }
    else { classification = "Growth Opportunity"; growth++; }

    predictions.push({
      url: urlPath,
      position: Math.round(position * 10) / 10,
      impressions,
      clicks,
      ctr,
      stability_score: stabilityScore,
      improvement_probability: improvementProb,
      drop_probability: dropProb,
      classification,
      inbound_links: inboundCount,
      crawl_depth: crawlDepth === 99 ? "orphan" : crawlDepth,
      is_orphan: isOrphan,
    });
  }

  // Sort by drop probability descending
  predictions.sort((a, b) => b.drop_probability - a.drop_probability);

  const report = {
    generated_at: new Date().toISOString(),
    total_urls: predictions.length,
    stable,
    at_risk: atRisk,
    growth_opportunities: growth,
    high_drop_risk: dropRisk,
    predictions,
  };

  fs.writeFileSync(path.join(REPORTS_DIR, "ranking-predictions.json"), JSON.stringify(report, null, 2), "utf8");

  console.log("\n══════════════════════════════════════════");
  console.log("  Ranking Predictor Summary");
  console.log("══════════════════════════════════════════");
  console.log(`  Total URLs analyzed:    ${predictions.length}`);
  console.log(`  Stable URLs:            ${stable}`);
  console.log(`  At Risk URLs:           ${atRisk}`);
  console.log(`  Growth Opportunities:   ${growth}`);
  console.log(`  High Drop Risk:         ${dropRisk}`);
  console.log("══════════════════════════════════════════\n");
}

main();
