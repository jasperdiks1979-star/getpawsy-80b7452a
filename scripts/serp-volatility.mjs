/**
 * serp-volatility.mjs
 * Detects abnormal ranking fluctuations and site-wide volatility.
 * Uses GSC data — output only, no modifications.
 */
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const REPORTS_DIR = path.join(process.cwd(), "reports");

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }

function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const gsc = readJson(path.join(DATA_DIR, "gsc-metrics.json"));
  // Load previous snapshot for comparison
  const prevGsc = readJson(path.join(DATA_DIR, "gsc-metrics-previous.json"));

  if (!gsc || !Array.isArray(gsc.rows) || gsc.rows.length === 0) {
    console.warn("[serp-volatility] No GSC data. Skipping.");
    return;
  }

  // Build previous data map
  const prevMap = {};
  if (prevGsc && Array.isArray(prevGsc.rows)) {
    for (const r of prevGsc.rows) {
      try { prevMap[new URL(r.page).pathname] = r; } catch { /* skip */ }
    }
  }

  const alerts = [];
  let totalDelta = 0;
  let deltaCount = 0;

  for (const row of gsc.rows) {
    let urlPath;
    try { urlPath = new URL(row.page).pathname; } catch { continue; }

    const prev = prevMap[urlPath];
    if (!prev) continue; // New URL, no comparison possible

    const posDelta = Math.abs((row.position || 0) - (prev.position || 0));
    const impChange = prev.impressions > 0
      ? ((row.impressions - prev.impressions) / prev.impressions) * 100
      : 0;
    const ctrChange = prev.ctr > 0
      ? ((row.ctr - prev.ctr) / prev.ctr) * 100
      : 0;

    totalDelta += posDelta;
    deltaCount++;

    const flags = [];
    if (posDelta > 3) flags.push(`Position swing: ${posDelta.toFixed(1)} positions`);
    if (impChange < -30) flags.push(`Impression drop: ${impChange.toFixed(0)}%`);
    if (Math.abs(ctrChange) > 20) flags.push(`CTR shift: ${ctrChange > 0 ? "+" : ""}${ctrChange.toFixed(0)}%`);

    if (flags.length > 0) {
      alerts.push({
        url: urlPath,
        position_current: Math.round((row.position || 0) * 10) / 10,
        position_previous: Math.round((prev.position || 0) * 10) / 10,
        position_delta: Math.round(posDelta * 10) / 10,
        impression_change_pct: Math.round(impChange),
        ctr_change_pct: Math.round(ctrChange),
        flags,
      });
    }
  }

  const volatilityIndex = deltaCount > 0 ? Math.round((totalDelta / deltaCount) * 100) / 100 : 0;
  const isHighVolatility = volatilityIndex > 2.5;

  // Save previous snapshot for next comparison
  fs.writeFileSync(
    path.join(DATA_DIR, "gsc-metrics-previous.json"),
    JSON.stringify(gsc, null, 2),
    "utf8"
  );

  alerts.sort((a, b) => b.position_delta - a.position_delta);

  const report = {
    generated_at: new Date().toISOString(),
    volatility_index: volatilityIndex,
    is_high_volatility: isHighVolatility,
    urls_compared: deltaCount,
    volatile_urls: alerts.length,
    alerts: alerts.slice(0, 100),
  };

  fs.writeFileSync(path.join(REPORTS_DIR, "serp-volatility.json"), JSON.stringify(report, null, 2), "utf8");

  console.log("\n══════════════════════════════════════════");
  console.log("  SERP Volatility Report");
  console.log("══════════════════════════════════════════");
  console.log(`  URLs compared:       ${deltaCount}`);
  console.log(`  Volatile URLs:       ${alerts.length}`);
  console.log(`  Volatility Index:    ${volatilityIndex}`);
  console.log(`  Status:              ${isHighVolatility ? "⚠️  HIGH VOLATILITY DETECTED" : "✅ Normal"}`);
  console.log("══════════════════════════════════════════\n");

  if (alerts.length > 0) {
    console.log("  Top volatile URLs:");
    for (const a of alerts.slice(0, 5)) {
      console.log(`    ${a.url} — Δ${a.position_delta} pos | ${a.flags.join(", ")}`);
    }
    console.log("");
  }
}

main();
