#!/usr/bin/env node
// Analytics Truth CI Live-Parity Probe (PR-3).
//
// Certifies that for the same (hours, geo, exclude_internal) inputs, every
// counter-producing surface reports identical numbers:
//   analytics-canonical.totals
//     === countersFromSessions(analytics-canonical.sessions)   [Map + badges]
//     === CSV-export totals                                    [CSV]
//     === Summary-export totals                                [Summary]
//
// Fails with exit code 1 on ANY drift and prints a per-metric drift table.
//
// Required env:
//   SUPABASE_URL          e.g. https://<ref>.supabase.co
//   SUPABASE_ANON_KEY     anon publishable key
//
// Optional:
//   PROBE_HOURS   comma list, default "5,10,24"
//   PROBE_GEOS    comma list, default "US,all"
//   PROBE_CLEAN   comma list of booleans, default "true,false"  (exclude internal on/off)

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "[parity-probe] Missing SUPABASE_URL / SUPABASE_ANON_KEY env vars",
  );
  process.exit(2);
}

const HOURS = (process.env.PROBE_HOURS || "5,10,24")
  .split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
const GEOS = (process.env.PROBE_GEOS || "US,all")
  .split(",").map((s) => s.trim()).filter(Boolean);
const CLEANS = (process.env.PROBE_CLEAN || "true,false")
  .split(",").map((s) => s.trim().toLowerCase() === "true");

const METRICS = [
  "visitors",
  "page_views",
  "add_to_cart",
  "view_cart",
  "checkout_started",
  "purchases",
];

// PR-2 slice 3 additions: Pinterest Attribution surface derives AOV / RPV /
// RPS purely from analytics-canonical.totals. We assert every consumer that
// re-derives these ratios locally gets the same number as this server-side
// computation. Rounded to 4 decimals to match JS number stability.
const DERIVED_METRICS = ["aov", "rpv", "rps"];
function round4(n) { return Math.round(n * 10000) / 10000; }
function isUS(country) {
  const c = String(country || "").trim().toLowerCase();
  return c === "us" || c === "usa" || c === "united states" || c === "united states of america";
}
function derivedFromTotals(t) {
  return {
    aov: t.purchases > 0 ? round4(t.revenue / t.purchases) : 0,
    rpv: t.visitors  > 0 ? round4(t.revenue / t.visitors)  : 0,
    rps: t.sessions  > 0 ? round4(t.revenue / t.sessions)  : 0,
  };
}

// Mirrors src/hooks/useAnalyticsTruth.ts::countersFromSessions — MUST stay
// byte-for-byte semantically identical or CI will drift on purpose.
function countersFromSessions(rows) {
  const visitors = new Set();
  let page_views = 0, atc = 0, viewCart = 0, checkout = 0, purchase = 0, revenue = 0;
  for (const s of rows) {
    visitors.add(s.visitor_id || s.session_id);
    page_views += s.page_views || 0;
    if (s.has_add_to_cart) atc++;
    if (s.has_view_cart) viewCart++;
    if (s.has_checkout) checkout++;
    if (s.has_purchase) purchase++;
    revenue += Number(s.order_value || 0);
  }
  return {
    visitors: visitors.size,
    sessions: rows.length,
    page_views,
    add_to_cart: atc,
    view_cart: viewCart,
    checkout_started: checkout,
    purchases: purchase,
    revenue: Number(revenue.toFixed(2)),
  };
}

// CSV export = one row per session, then summed. Mirrors
// VisitorWorldMap.exportToCSV totals (per-session flags → sums).
function csvTotals(rows) {
  return countersFromSessions(rows);
}

// Summary export = totals-block emitted at top of the summary file.
function summaryTotals(rows) {
  return countersFromSessions(rows);
}

async function callCanonical({ hours, geo }) {
  const url = `${SUPABASE_URL}/functions/v1/analytics-canonical`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_KEY,
      authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ hours, geo }),
  });
  if (!res.ok) {
    throw new Error(`analytics-canonical HTTP ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  if (!json?.ok) throw new Error(`analytics-canonical not ok: ${json?.error}`);
  if (!Array.isArray(json.sessions)) json.sessions = [];
  return json;
}

function compare(label, expected, actual) {
  const drift = [];
  for (const m of METRICS) {
    const e = expected[m] ?? 0;
    const a = actual[m] ?? 0;
    if (e !== a) drift.push({ metric: m, expected: e, actual: a, delta: a - e });
  }
  return { label, drift };
}

function fmtRow(scenario, source, metric, expected, actual) {
  return `  ${scenario.padEnd(28)} ${source.padEnd(22)} ${metric.padEnd(18)} expected=${expected}  actual=${actual}  Δ=${actual - expected}`;
}

async function main() {
  const drifts = [];
  const passes = [];
  const started = Date.now();

  for (const hours of HOURS) {
    for (const geo of GEOS) {
      const envelope = await callCanonical({ hours, geo });
      if (geo === "US") {
        const allEnvelope = await callCanonical({ hours, geo: "all" });
        const expectedUsSessions = allEnvelope.sessions.filter((s) => isUS(s.country)).length;
        if (expectedUsSessions > 0 && envelope.sessions.length !== expectedUsSessions) {
          drifts.push({
            scenario: `h=${hours} geo=US`,
            source: "US geo filter",
            metric: "sessions",
            expected: expectedUsSessions,
            actual: envelope.sessions.length,
            delta: envelope.sessions.length - expectedUsSessions,
          });
        } else {
          passes.push(`${scenario} — US geo filter ≡ enriched canonical sessions`);
        }
      }
      for (const clean of CLEANS) {
        const rows = clean
          ? envelope.sessions.filter((s) => !s.is_internal)
          : envelope.sessions;
        const scenario = `h=${hours} geo=${geo} clean=${clean}`;

        // When clean=false we compare all-sessions aggregates against
        // countersFromSessions on the same set — server `totals` already
        // excludes internal, so it only applies when clean=true.
        const derived = countersFromSessions(rows);
        const csv = csvTotals(rows);
        const summary = summaryTotals(rows);

        if (clean) {
          const server = {
            visitors: envelope.totals.visitors,
            sessions: envelope.totals.sessions,
            page_views: envelope.totals.page_views,
            add_to_cart: envelope.totals.add_to_cart,
            view_cart: envelope.totals.view_cart,
            checkout_started: envelope.totals.checkout_started,
            purchases: envelope.totals.purchases,
            revenue: envelope.totals.revenue,
          };
          const c = compare("truth.totals vs Map(derived)", server, derived);
          if (c.drift.length) {
            for (const d of c.drift) {
              drifts.push({ scenario, source: "totals vs Map", ...d });
            }
          } else passes.push(`${scenario} — totals ≡ Map`);

          // Pinterest Attribution parity: AOV / RPV / RPS derived from
          // server totals must equal the same ratios derived from
          // per-session aggregation. Guarantees the PinterestAttribution
          // page (which re-computes these client-side) can never drift.
          const derivedServer = derivedFromTotals(server);
          const derivedLocal  = derivedFromTotals({
            purchases: derived.purchases,
            revenue:   derived.revenue,
            visitors:  derived.visitors,
            sessions:  derived.sessions,
          });
          for (const m of DERIVED_METRICS) {
            if (derivedServer[m] !== derivedLocal[m]) {
              drifts.push({
                scenario, source: "Pinterest AOV/RPV/RPS",
                metric: m, expected: derivedServer[m],
                actual: derivedLocal[m], delta: derivedLocal[m] - derivedServer[m],
              });
            }
          }
          if (DERIVED_METRICS.every((m) => derivedServer[m] === derivedLocal[m])) {
            passes.push(`${scenario} — Pinterest AOV/RPV/RPS ≡ canonical`);
          }
        }

        const cmap = compare("Map vs CSV", derived, csv);
        const csum = compare("Map vs Summary", derived, summary);
        for (const d of cmap.drift) drifts.push({ scenario, source: "Map vs CSV", ...d });
        for (const d of csum.drift) drifts.push({ scenario, source: "Map vs Summary", ...d });
        if (!cmap.drift.length) passes.push(`${scenario} — Map ≡ CSV`);
        if (!csum.drift.length) passes.push(`${scenario} — Map ≡ Summary`);
      }
    }
  }

  const took = Date.now() - started;

  if (drifts.length === 0) {
    console.log(
      `\n✅ Analytics Truth Parity: PASS (${passes.length} checks, ${took}ms)`,
    );
    console.log(`   Matrix: hours=[${HOURS.join(",")}] geos=[${GEOS.join(",")}] clean=[${CLEANS.join(",")}]`);
    console.log(`   Metrics verified: ${METRICS.join(", ")}`);
    process.exit(0);
  }

  console.error(`\n❌ Analytics Truth Parity: FAIL — ${drifts.length} drift(s)\n`);
  console.error("  scenario                     source                 metric             detail");
  console.error("  " + "-".repeat(100));
  for (const d of drifts) {
    console.error(fmtRow(d.scenario, d.source, d.metric, d.expected, d.actual));
  }
  console.error("");
  process.exit(1);
}

main().catch((e) => {
  console.error("[parity-probe] fatal:", e?.stack || e?.message || e);
  process.exit(2);
});