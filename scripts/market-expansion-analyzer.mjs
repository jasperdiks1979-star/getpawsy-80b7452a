/**
 * market-expansion-analyzer.mjs
 * Identifies international growth markets from GSC country data.
 * Recommendations only — no automatic deployment.
 */
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const REPORTS_DIR = path.join(process.cwd(), "reports");

const SUPABASE_URL = "https://nojvgfbcjgipjxpfatmm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc";

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }

// Shipping feasibility config (manual — extend as needed)
const SHIPPING_CONFIG = {
  US: { feasible: true, currency: "USD", subfolder: null, hreflang: "en-us" },
  CA: { feasible: true, currency: "CAD", subfolder: "/ca/", hreflang: "en-ca" },
  GB: { feasible: true, currency: "GBP", subfolder: "/uk/", hreflang: "en-gb" },
  AU: { feasible: true, currency: "AUD", subfolder: "/au/", hreflang: "en-au" },
  DE: { feasible: true, currency: "EUR", subfolder: "/de/", hreflang: "de-de" },
  FR: { feasible: true, currency: "EUR", subfolder: "/fr/", hreflang: "fr-fr" },
  NL: { feasible: true, currency: "EUR", subfolder: "/nl/", hreflang: "nl-nl" },
  SE: { feasible: true, currency: "SEK", subfolder: "/se/", hreflang: "sv-se" },
  JP: { feasible: false, currency: "JPY", subfolder: "/jp/", hreflang: "ja-jp" },
  IN: { feasible: false, currency: "INR", subfolder: null, hreflang: "en-in" },
};

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GSC_API = "https://searchconsole.googleapis.com/webmasters/v3";
const SITE_URL = "sc-domain:getpawsy.pet";

function loadServiceAccount() {
  const envJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (envJson) try { return JSON.parse(envJson); } catch { /* fall */ }
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "google-service-account.json"), "utf8")); } catch { return null; }
}

function base64url(str) { return Buffer.from(str).toString("base64url"); }

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: TOKEN_URL, iat: now, exp: now + 3600,
  }));
  const crypto = await import("node:crypto");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(sa.private_key, "base64url");
  const res = await fetch(TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${header}.${payload}.${signature}`,
  });
  if (!res.ok) throw new Error(`Token error ${res.status}`);
  return (await res.json()).access_token;
}

async function queryGscByCountry(token) {
  const endDate = new Date();
  const startDate = new Date(); startDate.setDate(endDate.getDate() - 28);
  const res = await fetch(`${GSC_API}/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      dimensions: ["country"],
      rowLimit: 50,
    }),
  });
  if (!res.ok) throw new Error(`GSC country query error ${res.status}`);
  return await res.json();
}

async function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  // Try fetching live country data from GSC
  let countryData = null;
  const sa = loadServiceAccount();
  if (sa) {
    try {
      const token = await getAccessToken(sa);
      countryData = await queryGscByCountry(token);
    } catch (err) {
      console.warn(`[market-expansion] GSC country query failed (non-blocking): ${err.message}`);
    }
  }

  if (!countryData?.rows?.length) {
    console.warn("[market-expansion] No country data available. Skipping.");
    const emptyReport = { generated_at: new Date().toISOString(), status: "no_data", markets: [] };
    fs.writeFileSync(path.join(REPORTS_DIR, "market-expansion.json"), JSON.stringify(emptyReport, null, 2), "utf8");
    return;
  }

  // Parse country metrics
  const markets = countryData.rows
    .map((r) => ({
      country: r.keys?.[0] || "??",
      impressions: r.impressions || 0,
      clicks: r.clicks || 0,
      ctr: Math.round((r.ctr || 0) * 10000) / 100,
      position: Math.round((r.position || 0) * 10) / 10,
    }))
    .filter((m) => m.country !== "usa" && m.country !== "US")
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);

  // Enrich with shipping/expansion data
  const enriched = markets.map((m) => {
    const code = m.country.toUpperCase();
    const config = SHIPPING_CONFIG[code] || { feasible: false, currency: "USD", subfolder: null, hreflang: null };

    // Estimate growth priority
    let priority = "low";
    if (m.impressions > 1000 && config.feasible) priority = "high";
    else if (m.impressions > 300 && config.feasible) priority = "medium";
    else if (m.impressions > 100) priority = "low";

    return {
      country: code,
      impressions: m.impressions,
      clicks: m.clicks,
      ctr: m.ctr,
      avg_position: m.position,
      shipping_feasible: config.feasible,
      currency: config.currency,
      recommended_subfolder: config.subfolder,
      hreflang: config.hreflang,
      priority,
      recommendations: [
        config.subfolder ? `Create subfolder ${config.subfolder} with localized content` : "Evaluate market size before expansion",
        config.hreflang ? `Add hreflang="${config.hreflang}" tags` : null,
        config.feasible ? `Enable ${config.currency} currency display` : "Shipping not currently feasible",
        m.ctr < 2 ? "Localize title tags for this market" : null,
      ].filter(Boolean),
    };
  });

  const report = {
    generated_at: new Date().toISOString(),
    markets_analyzed: enriched.length,
    high_priority: enriched.filter((m) => m.priority === "high").length,
    markets: enriched,
  };

  fs.writeFileSync(path.join(REPORTS_DIR, "market-expansion.json"), JSON.stringify(report, null, 2), "utf8");

  console.log("\n══════════════════════════════════════════");
  console.log("  Market Expansion Candidates");
  console.log("══════════════════════════════════════════");
  console.log(`  ${"Country".padEnd(10)} ${"Impressions".padEnd(14)} ${"Avg Pos".padEnd(10)} Priority`);
  console.log(`  ${"─".repeat(44)}`);
  for (const m of enriched.slice(0, 5)) {
    console.log(`  ${m.country.padEnd(10)} ${String(m.impressions).padEnd(14)} ${String(m.avg_position).padEnd(10)} ${m.priority}`);
  }
  console.log("══════════════════════════════════════════\n");
}

main().catch((err) => {
  console.warn(`[market-expansion] Failed (non-blocking): ${err.message}`);
});
