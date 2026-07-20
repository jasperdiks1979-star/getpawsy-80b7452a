import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Canonical metric catalog — the ONE certified truth for Genesis Ω.3.
// Each entry declares the single source authorized to drive dashboards/AI.
const CATALOG: Array<{
  key: string; name: string; domain: string; status: string;
  source: string; formula: string; unit: string; consumers: string[];
  sources: string[]; confidence: number;
}> = [
  { key: "visitors.daily", name: "Daily Visitors", domain: "analytics", status: "canonical",
    source: "canonical_sessions", formula: "count(distinct session_id) where classification='human'",
    unit: "sessions", consumers: ["CEOCommandCenter","RevenueCommandCenter","TrafficCommandCenter"],
    sources: ["canonical_sessions","ga4_daily_snapshots"], confidence: 98 },
  { key: "pageviews.daily", name: "Daily Pageviews", domain: "analytics", status: "canonical",
    source: "canonical_events", formula: "count(*) where event_name='page_view'",
    unit: "events", consumers: ["AnalyticsTruth","CEOCommandCenter"],
    sources: ["canonical_events","ga4_daily_snapshots"], confidence: 97 },
  { key: "orders.count", name: "Orders", domain: "revenue", status: "canonical",
    source: "orders", formula: "count(*) where status='paid'",
    unit: "orders", consumers: ["CEOCommandCenter","RevenueCommandCenter","FinanceIntelligence","CFOChat"],
    sources: ["orders","stripe"], confidence: 100 },
  { key: "revenue.gross", name: "Gross Revenue (USD)", domain: "revenue", status: "canonical",
    source: "orders", formula: "sum(total_amount) where status='paid'",
    unit: "usd", consumers: ["CEOCommandCenter","RevenueCommandCenter","FinanceIntelligence","CFOChat","CFOReports"],
    sources: ["orders","stripe"], confidence: 100 },
  { key: "revenue.net", name: "Net Revenue", domain: "revenue", status: "canonical",
    source: "orders", formula: "sum(total_amount - refunds - fees)",
    unit: "usd", consumers: ["FinanceIntelligence","CFOReports"],
    sources: ["orders","stripe"], confidence: 98 },
  { key: "profit.net", name: "Net Profit", domain: "finance", status: "canonical",
    source: "finance_reports", formula: "revenue.net - expenses.total - taxes.vat",
    unit: "usd", consumers: ["CEOCommandCenter","FinancialHealth","CFOReports"],
    sources: ["finance_reports","orders","evidence_documents"], confidence: 92 },
  { key: "expenses.total", name: "Total Expenses", domain: "finance", status: "canonical",
    source: "evidence_documents", formula: "sum(amount) where kind='expense'",
    unit: "usd", consumers: ["FinanceIntelligence","CFOReports","AccountantPortal"],
    sources: ["evidence_documents","finance_expense_categories"], confidence: 95 },
  { key: "taxes.vat.recoverable", name: "Recoverable VAT", domain: "tax", status: "canonical",
    source: "finance_vat_summaries", formula: "sum(vat_input - vat_output)",
    unit: "eur", consumers: ["EvidenceVault","AccountantPortal","CFOReports"],
    sources: ["finance_vat_summaries","finance_vat_reconciliations"], confidence: 96 },
  { key: "products.total", name: "Total Products", domain: "catalog", status: "canonical",
    source: "products", formula: "count(*) where visible=true",
    unit: "products", consumers: ["CEOCommandCenter","ProductIntelligence"],
    sources: ["products"], confidence: 100 },
  { key: "inventory.in_stock", name: "In-Stock Products", domain: "inventory", status: "canonical",
    source: "products", formula: "count(*) where us_stock>0 or eu_stock>0",
    unit: "products", consumers: ["CEOCommandCenter","PinterestHealth"],
    sources: ["products","cj_sync_runs"], confidence: 99 },
  { key: "pins.published", name: "Published Pins", domain: "pinterest", status: "canonical",
    source: "pinterest_pins", formula: "count(*) where status='published'",
    unit: "pins", consumers: ["PinterestCommandCenter","PinterestHealth"],
    sources: ["pinterest_pins","pinterest_publish_logs"], confidence: 98 },
  { key: "pins.impressions", name: "Pin Impressions (7d)", domain: "pinterest", status: "canonical",
    source: "pinterest_analytics_daily", formula: "sum(impressions) last 7d",
    unit: "impressions", consumers: ["PinterestCommandCenter","GrowthCommandCenter"],
    sources: ["pinterest_analytics_daily","pinterest_pin_performance"], confidence: 94 },
  { key: "pins.clicks", name: "Pin Clicks (7d)", domain: "pinterest", status: "canonical",
    source: "pinterest_analytics_daily", formula: "sum(clicks) last 7d",
    unit: "clicks", consumers: ["PinterestCommandCenter","TrafficCommandCenter"],
    sources: ["pinterest_analytics_daily","canonical_events"], confidence: 93 },
  { key: "conversions.atc", name: "Add to Cart", domain: "conversion", status: "canonical",
    source: "canonical_events", formula: "count(*) where event_name='add_to_cart'",
    unit: "events", consumers: ["ConversionCommander","CROCommandCenter","RevenueCommandCenter"],
    sources: ["canonical_events","ga4_daily_snapshots"], confidence: 96 },
  { key: "conversions.checkout_start", name: "Checkout Started", domain: "conversion", status: "canonical",
    source: "checkout_funnel_events", formula: "count(*) where step='checkout_started'",
    unit: "events", consumers: ["ConversionCommander","RevenueCommandCenter"],
    sources: ["checkout_funnel_events","canonical_events"], confidence: 97 },
  { key: "conversions.purchase", name: "Purchases", domain: "conversion", status: "canonical",
    source: "orders", formula: "count(*) where status='paid'",
    unit: "events", consumers: ["ConversionCommander","CEOCommandCenter"],
    sources: ["orders","stripe","canonical_events"], confidence: 100 },
  { key: "conversion.rate", name: "Conversion Rate", domain: "conversion", status: "canonical",
    source: "canonical_sessions", formula: "purchases / sessions",
    unit: "ratio", consumers: ["CEOCommandCenter","ConversionCommander"],
    sources: ["orders","canonical_sessions"], confidence: 95 },
  { key: "ai.spend.daily", name: "AI Spend (USD)", domain: "ai", status: "canonical",
    source: "ai_gateway_logs", formula: "sum(cost_usd) per day",
    unit: "usd", consumers: ["AiGatewayCredits","CFOReports","FinanceIntelligence"],
    sources: ["ai_gateway_logs","ai_trace_events"], confidence: 99 },
  { key: "stripe.balance", name: "Stripe Balance", domain: "finance", status: "canonical",
    source: "stripe", formula: "balance.available[0].amount",
    unit: "usd", consumers: ["FinanceIntelligence","CEOCommandCenter"],
    sources: ["stripe"], confidence: 100 },
  { key: "abandoned_carts.count", name: "Abandoned Carts (24h)", domain: "conversion", status: "canonical",
    source: "abandoned_carts", formula: "count(*) last 24h",
    unit: "carts", consumers: ["ConversionCommander","RevenueRecovery"],
    sources: ["abandoned_carts"], confidence: 96 },
  // Known deprecated / experimental to flag
  { key: "visitors.legacy_ga", name: "GA Legacy Visitors", domain: "analytics", status: "deprecated",
    source: "ga4_daily_snapshots", formula: "legacy metric replaced by canonical_sessions",
    unit: "sessions", consumers: [], sources: ["ga4_daily_snapshots"], confidence: 40 },
  { key: "revenue.pinterest_attributed", name: "Pinterest-Attributed Revenue", domain: "revenue", status: "experimental",
    source: "pinterest_revenue_attribution_v3", formula: "attribution model v3 (probabilistic)",
    unit: "usd", consumers: ["PinterestRevenue"], sources: ["pinterest_revenue_attribution_v3"], confidence: 78 },
];

async function sha256Hex(input: string) {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // PHASE 1-4: upsert canonical catalog
    for (const m of CATALOG) {
      await supabase.from("genesis_truth_metrics").upsert({
        metric_key: m.key,
        display_name: m.name,
        domain: m.domain,
        status: m.status,
        canonical_source: m.source,
        formula: m.formula,
        unit: m.unit,
        consumers: m.consumers,
        sources: m.sources,
        confidence: m.confidence,
        last_validated_at: new Date().toISOString(),
      }, { onConflict: "metric_key" });
    }

    // PHASE 2: lineage nodes (source -> metric -> consumers)
    await supabase.from("genesis_truth_lineage").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const lineageRows: any[] = [];
    for (const m of CATALOG) {
      for (const s of m.sources) lineageRows.push({ metric_key: m.key, node_type: "source", node_name: s, role: "input" });
      for (const c of m.consumers) lineageRows.push({ metric_key: m.key, node_type: "consumer", node_name: c, role: "output" });
    }
    if (lineageRows.length) await supabase.from("genesis_truth_lineage").insert(lineageRows);

    // PHASE 3: conflict detection — revenue truth: orders vs stripe (sample)
    const conflicts: any[] = [];
    const { data: ordersAgg } = await supabase.from("orders").select("total_amount, status");
    const paidOrders = (ordersAgg ?? []).filter((o: any) => o.status === "paid");
    const revenueOrders = paidOrders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
    // Compare against pinterest attributed (experimental) — expected mismatch
    const { data: pinAttr } = await supabase.from("pinterest_revenue_attribution_v3").select("attributed_revenue_usd").limit(1000);
    const revenuePin = (pinAttr ?? []).reduce((s: number, r: any) => s + Number(r.attributed_revenue_usd || 0), 0);
    if (Math.abs(revenueOrders - revenuePin) > 1) {
      conflicts.push({
        metric_key: "revenue.gross", source_a: "orders", source_b: "pinterest_revenue_attribution_v3",
        value_a: revenueOrders, value_b: revenuePin,
        delta_pct: revenueOrders ? ((revenuePin - revenueOrders) / revenueOrders) * 100 : null,
        severity: "info", status: "explained",
        explanation: "Expected: attribution model is a subset probabilistic view, not gross revenue truth.",
      });
    }

    // Visitors: canonical_sessions vs ga4_daily_snapshots
    const { data: csRow } = await supabase.from("canonical_sessions").select("session_id", { count: "exact", head: true });
    const { data: gaRow } = await supabase.from("ga4_daily_snapshots").select("sessions").order("date", { ascending: false }).limit(30);
    const gaSessions = (gaRow ?? []).reduce((s: number, r: any) => s + Number(r.sessions || 0), 0);
    const csCount = (csRow as any)?.length ?? 0;
    if (gaSessions && Math.abs(gaSessions - csCount) / Math.max(gaSessions, 1) > 0.15) {
      conflicts.push({
        metric_key: "visitors.daily", source_a: "canonical_sessions", source_b: "ga4_daily_snapshots",
        value_a: csCount, value_b: gaSessions,
        delta_pct: ((csCount - gaSessions) / Math.max(gaSessions, 1)) * 100,
        severity: "medium", status: "open",
        explanation: "Bot filter and timezone differences between canonical layer and GA4 export.",
      });
    }

    if (conflicts.length) await supabase.from("genesis_truth_conflicts").insert(conflicts);

    // PHASE 4/8: compute snapshot & truth scores
    const counts = { canonical: 0, derived: 0, experimental: 0, deprecated: 0, broken: 0, unknown: 0 };
    for (const m of CATALOG) (counts as any)[m.status] = ((counts as any)[m.status] ?? 0) + 1;

    const total = CATALOG.length;
    const domainScore = (domain: string) => {
      const rows = CATALOG.filter((c) => c.domain === domain);
      if (!rows.length) return 100;
      return Math.round(rows.reduce((s, r) => s + (r.status === "canonical" ? r.confidence : r.confidence * 0.5), 0) / rows.length);
    };
    const data_integrity = domainScore("analytics");
    const revenue_integrity = domainScore("revenue");
    const analytics_integrity = domainScore("analytics");
    const financial_integrity = Math.round((domainScore("finance") + domainScore("tax")) / 2);
    const ai_integrity = domainScore("ai");
    const operational_integrity = Math.round((domainScore("catalog") + domainScore("inventory") + domainScore("pinterest")) / 3);
    const overall = Math.round(
      (data_integrity + revenue_integrity + analytics_integrity + financial_integrity + ai_integrity + operational_integrity) / 6
      - conflicts.filter((c) => c.status === "open").length * 2
    );

    const executive_report = {
      canonical_metrics: counts.canonical,
      deprecated_metrics: counts.deprecated,
      experimental_metrics: counts.experimental,
      broken_metrics: counts.broken,
      unknown_metrics: counts.unknown,
      total_metrics: total,
      conflicts_open: conflicts.filter((c) => c.status === "open").length,
      conflicts_explained: conflicts.filter((c) => c.status === "explained").length,
      truth_coverage_pct: Math.round((counts.canonical / total) * 100),
      revenue_orders_usd: revenueOrders,
      generated_at: new Date().toISOString(),
      law: "There shall forever exist only ONE certified truth inside Genesis.",
    };

    const fingerprint = await sha256Hex(JSON.stringify(executive_report));

    const { data: snap, error: snapErr } = await supabase.from("genesis_truth_snapshots").insert({
      total_metrics: total,
      canonical_count: counts.canonical,
      derived_count: counts.derived,
      experimental_count: counts.experimental,
      deprecated_count: counts.deprecated,
      broken_count: counts.broken,
      unknown_count: counts.unknown,
      conflict_count: conflicts.length,
      resolved_count: conflicts.filter((c) => c.status === "explained").length,
      data_integrity, revenue_integrity, analytics_integrity,
      financial_integrity, ai_integrity, operational_integrity,
      overall_truth_score: Math.max(0, Math.min(100, overall)),
      executive_report,
      fingerprint,
    }).select().single();
    if (snapErr) throw snapErr;

    return new Response(JSON.stringify({ ok: true, snapshot: snap, conflicts_detected: conflicts.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});