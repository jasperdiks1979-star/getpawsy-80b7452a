/**
 * ml-rank-forecast.mjs
 * 30-day ranking forecast using linear regression on GSC + crawl data.
 * No external ML dependencies — pure math.
 */
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const REPORTS_DIR = path.join(process.cwd(), "reports");

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }

// Simple linear regression: returns slope and intercept
function linearRegression(points) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0, r2: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (const { x, y } of points) {
    sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x; sumY2 += y * y;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R² calculation
  const yMean = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (const { x, y } of points) {
    ssTot += (y - yMean) ** 2;
    ssRes += (y - (slope * x + intercept)) ** 2;
  }
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  return { slope, intercept, r2 };
}

function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const gsc = readJson(path.join(DATA_DIR, "gsc-metrics.json"));
  const prevGsc = readJson(path.join(DATA_DIR, "gsc-metrics-previous.json"));
  const crawlReport = readJson(path.join(REPORTS_DIR, "crawl-report.json"));

  if (!gsc?.rows?.length) {
    console.warn("[ml-forecast] No GSC data. Skipping.");
    return;
  }

  // Build previous data map
  const prevMap = {};
  if (prevGsc?.rows) for (const r of prevGsc.rows) {
    try { prevMap[new URL(r.page).pathname] = r; } catch { /* skip */ }
  }

  const lowInbound = new Map();
  for (const item of (crawlReport?.low_inbound_urls || [])) lowInbound.set(item.path, item);
  const orphans = new Set(crawlReport?.orphan_urls || []);

  const forecasts = [];
  let improve = 0, stable = 0, decline = 0;

  for (const row of gsc.rows) {
    let urlPath;
    try { urlPath = new URL(row.page).pathname; } catch { continue; }

    const prev = prevMap[urlPath];
    const curPos = row.position || 50;
    const curImp = row.impressions || 0;
    const curCtr = row.ctr || 0;

    // Build time-series points (2 data points: prev and current)
    const posPoints = [];
    const impPoints = [];
    if (prev) {
      posPoints.push({ x: 0, y: prev.position || 50 }, { x: 1, y: curPos });
      impPoints.push({ x: 0, y: prev.impressions || 0 }, { x: 1, y: curImp });
    } else {
      posPoints.push({ x: 0, y: curPos });
      impPoints.push({ x: 0, y: curImp });
    }

    const posReg = linearRegression(posPoints);
    const impReg = linearRegression(impPoints);

    // Forecast position 30 days out (normalize to ~4 periods)
    const forecastSteps = prev ? 5 : 1; // 30 days ≈ 4 more periods from now
    const forecastPos = Math.max(1, Math.min(100, posReg.slope * forecastSteps + posReg.intercept));

    // Internal link factor
    const inboundInfo = lowInbound.get(urlPath);
    const linkStrength = orphans.has(urlPath) ? 0.2 : (inboundInfo ? 0.5 : 0.8);

    // Risk score (0–1): combines trend + link weakness
    const trendRisk = posReg.slope > 0 ? Math.min(1, posReg.slope * 0.3) : 0; // rising position = worsening
    const linkRisk = 1 - linkStrength;
    const impRisk = impReg.slope < 0 ? Math.min(1, Math.abs(impReg.slope) * 0.005) : 0;
    const riskScore = Math.round(Math.min(1, (trendRisk * 0.4 + linkRisk * 0.3 + impRisk * 0.3)) * 100) / 100;

    // Confidence based on data availability and R²
    const dataConfidence = prev ? 60 : 20;
    const confidence = Math.round(Math.min(95, dataConfidence + posReg.r2 * 30));

    // Classification
    let classification;
    const posDelta = forecastPos - curPos;
    if (posDelta < -1) { classification = "Likely Improve"; improve++; }
    else if (posDelta > 1.5) { classification = "Likely Decline"; decline++; }
    else { classification = "Likely Stable"; stable++; }

    forecasts.push({
      url: urlPath,
      current_position: Math.round(curPos * 10) / 10,
      forecast_position: Math.round(forecastPos * 10) / 10,
      position_trend_slope: Math.round(posReg.slope * 1000) / 1000,
      impression_trend_slope: Math.round(impReg.slope * 100) / 100,
      risk_score: riskScore,
      confidence,
      classification,
      link_strength: Math.round(linkStrength * 100) / 100,
    });
  }

  forecasts.sort((a, b) => b.risk_score - a.risk_score);

  const report = {
    generated_at: new Date().toISOString(),
    total_urls: forecasts.length,
    likely_improve: improve,
    likely_stable: stable,
    likely_decline: decline,
    forecasts,
  };

  fs.writeFileSync(path.join(REPORTS_DIR, "rank-forecast.json"), JSON.stringify(report, null, 2), "utf8");

  console.log("\n══════════════════════════════════════════");
  console.log("  ML Rank Forecast (30-day)");
  console.log("══════════════════════════════════════════");
  console.log(`  URLs forecasted:     ${forecasts.length}`);
  console.log(`  Likely Improve:      ${improve}`);
  console.log(`  Likely Stable:       ${stable}`);
  console.log(`  Likely Decline:      ${decline}`);
  console.log("══════════════════════════════════════════\n");
}

main();
