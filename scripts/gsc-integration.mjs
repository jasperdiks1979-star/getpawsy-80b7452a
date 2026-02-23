/**
 * gsc-integration.mjs
 * Pulls Google Search Console data and saves to /data/gsc-metrics.json.
 * Never blocks build — logs warnings on failure.
 */

import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const REPORTS_DIR = path.join(process.cwd(), "reports");
const SITE_URL = "sc-domain:getpawsy.pet";

// Google API endpoints
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GSC_API = "https://searchconsole.googleapis.com/webmasters/v3";

function loadServiceAccount() {
  // Try env var first (JSON string)
  const envJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (envJson) {
    try { return JSON.parse(envJson); } catch { /* fall through */ }
  }
  // CI/CD may have it as a file
  const filePath = path.join(process.cwd(), "google-service-account.json");
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; }
}

function base64url(str) {
  return Buffer.from(str).toString("base64url");
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));

  // Sign JWT with private key
  const crypto = await import("node:crypto");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(sa.private_key, "base64url");

  const jwt = `${header}.${payload}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function queryGSC(token) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 28);

  const body = {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    dimensions: ["page"],
    rowLimit: 5000,
    startRow: 0,
  };

  const res = await fetch(
    `${GSC_API}/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GSC API error ${res.status}: ${text}`);
  }

  return await res.json();
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const sa = loadServiceAccount();
  if (!sa) {
    console.warn("[gsc] ⚠️ No service account credentials found. Skipping GSC integration.");
    return;
  }

  let token;
  try {
    token = await getAccessToken(sa);
  } catch (err) {
    console.warn(`[gsc] ⚠️ Auth failed (non-blocking): ${err.message}`);
    return;
  }

  let data;
  try {
    data = await queryGSC(token);
  } catch (err) {
    console.warn(`[gsc] ⚠️ Query failed (non-blocking): ${err.message}`);
    return;
  }

  // Normalize rows
  const rows = (data.rows || []).map((r) => ({
    page: r.keys?.[0] || "",
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    ctr: Math.round((r.ctr || 0) * 10000) / 100,
    position: Math.round((r.position || 0) * 10) / 10,
  }));

  // Save raw data
  const output = {
    fetched_at: new Date().toISOString(),
    total_rows: rows.length,
    rows,
  };

  fs.writeFileSync(path.join(DATA_DIR, "gsc-metrics.json"), JSON.stringify(output, null, 2), "utf8");

  // Analyze
  const highImpLowCtr = rows.filter((r) => r.impressions > 100 && r.ctr < 3);
  const pos4to8 = rows.filter((r) => r.position >= 4 && r.position <= 8);
  const top3 = rows.filter((r) => r.position > 0 && r.position <= 3);

  // Save analysis report
  const report = {
    generated_at: new Date().toISOString(),
    urls_analyzed: rows.length,
    high_impression_low_ctr: highImpLowCtr.map((r) => ({ page: r.page, impressions: r.impressions, ctr: r.ctr })),
    position_4_to_8_targets: pos4to8.map((r) => ({ page: r.page, position: r.position, impressions: r.impressions })),
    top_3_protected: top3.map((r) => ({ page: r.page, position: r.position, clicks: r.clicks })),
  };

  fs.writeFileSync(path.join(REPORTS_DIR, "gsc-report.json"), JSON.stringify(report, null, 2), "utf8");

  console.log("\n══════════════════════════════════════════");
  console.log("  GSC Data Summary");
  console.log("══════════════════════════════════════════");
  console.log(`  URLs analyzed:            ${rows.length}`);
  console.log(`  High impression low CTR:  ${highImpLowCtr.length}`);
  console.log(`  Position 4–8 targets:     ${pos4to8.length}`);
  console.log(`  Top 3 protected URLs:     ${top3.length}`);
  console.log("══════════════════════════════════════════\n");
}

main().catch((err) => {
  console.warn(`[gsc] ⚠️ GSC integration failed (non-blocking): ${err.message}`);
});
