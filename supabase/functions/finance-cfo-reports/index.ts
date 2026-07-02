// CFO Report Library — generates and lists the 9 CFO report types.
// Admin only. Renders HTML report + JSON summary, uploads to genesis-vault,
// registers in finance_reports and evidence_documents.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "genesis-vault";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function fmtMoney(minor: number, currency = "EUR"): string {
  const v = (minor || 0) / 100;
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v); }
  catch { return `${currency} ${v.toFixed(2)}`; }
}

type ReportType = "monthly" | "quarterly" | "annual" | "lifetime" | "ai_spending" | "infrastructure" | "assets" | "suppliers" | "tax_readiness";

interface GenerateBody {
  action?: "generate" | "list";
  report_type?: ReportType;
  year?: number;
  month?: number;
  quarter?: number;
}

function resolveRange(rt: ReportType, body: GenerateBody): { start: string; end: string; label: string; periodYear: number; periodNumber: number | null } {
  const now = new Date();
  const year = Number(body.year) || now.getUTCFullYear();
  if (rt === "monthly") {
    const m = Math.max(1, Math.min(12, Number(body.month) || now.getUTCMonth() + 1));
    const s = new Date(Date.UTC(year, m - 1, 1));
    const e = new Date(Date.UTC(year, m, 0));
    const mm = String(m).padStart(2, "0");
    return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10), label: `${year}-${mm}`, periodYear: year, periodNumber: m };
  }
  if (rt === "quarterly") {
    const q = Math.max(1, Math.min(4, Number(body.quarter) || Math.floor(now.getUTCMonth() / 3) + 1));
    const sm = (q - 1) * 3;
    const s = new Date(Date.UTC(year, sm, 1));
    const e = new Date(Date.UTC(year, sm + 3, 0));
    return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10), label: `${year}-Q${q}`, periodYear: year, periodNumber: q };
  }
  if (rt === "annual") {
    return { start: `${year}-01-01`, end: `${year}-12-31`, label: `${year}-annual`, periodYear: year, periodNumber: null };
  }
  if (rt === "lifetime") {
    return { start: "1970-01-01", end: now.toISOString().slice(0, 10), label: "lifetime", periodYear: year, periodNumber: null };
  }
  // ai_spending / infrastructure / assets / suppliers / tax_readiness — default to YTD or full year
  if (body.month) {
    const m = Math.max(1, Math.min(12, body.month));
    const s = new Date(Date.UTC(year, m - 1, 1));
    const e = new Date(Date.UTC(year, m, 0));
    return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10), label: `${rt}-${year}-${String(m).padStart(2, "0")}`, periodYear: year, periodNumber: m };
  }
  if (body.quarter) {
    const q = Math.max(1, Math.min(4, body.quarter));
    const sm = (q - 1) * 3;
    const s = new Date(Date.UTC(year, sm, 1));
    const e = new Date(Date.UTC(year, sm + 3, 0));
    return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10), label: `${rt}-${year}-Q${q}`, periodYear: year, periodNumber: q };
  }
  return { start: `${year}-01-01`, end: `${year}-12-31`, label: `${rt}-${year}`, periodYear: year, periodNumber: null };
}

const REPORT_META: Record<ReportType, { title: string; blurb: string }> = {
  monthly: { title: "Monthly Financial Report", blurb: "Revenue, expenses, VAT and cash movement for one calendar month." },
  quarterly: { title: "Quarterly Financial Report", blurb: "Consolidated quarter view with VAT-ready totals." },
  annual: { title: "Annual Financial Report", blurb: "Full-year P&L, VAT, subscriptions and asset movement." },
  lifetime: { title: "Lifetime Financial Report", blurb: "Every euro since inception, grouped by category and year." },
  ai_spending: { title: "AI Spending Report", blurb: "Everything spent on AI (OpenAI, Anthropic, Google, Lovable AI, etc.)." },
  infrastructure: { title: "Infrastructure Spending Report", blurb: "Hosting, database, CDN, deployment and monitoring costs." },
  assets: { title: "Business Asset Report", blurb: "Registered assets with purchase price, depreciation and book value." },
  suppliers: { title: "Supplier Scorecard Report", blurb: "Ranked spend, invoice completeness and health per supplier." },
  tax_readiness: { title: "Tax Readiness Report", blurb: "Belastingdienst-facing readiness: recoverable VAT, missing docs, anomalies." },
};

const AI_MATCH = /openai|anthropic|claude|gemini|google ai|perplexity|elevenlabs|runway|midjourney|stability|cohere|mistral|deepseek|hugging|replicate|lovable ai|ai gateway/i;
const INFRA_MATCH = /vercel|cloudflare|render|fly\.io|aws|amazon web|google cloud|gcp|azure|supabase|lovable|netlify|digital ?ocean|heroku|domain|hosting|namecheap|gandi|godaddy|route ?53|sendgrid|resend|mailgun|postmark|twilio|datadog|sentry|logtail|new relic|github|gitlab|bitbucket|cdn|redis|upstash/i;

type SupabaseAdmin = ReturnType<typeof createClient>;

async function fetchDocs(admin: SupabaseAdmin, start: string, end: string) {
  const { data } = await admin
    .from("evidence_documents")
    .select("id,title,document_type,category,supplier_name,document_date,amount_minor,currency,vat_minor,invoice_number,tax_country")
    .gte("document_date", start)
    .lte("document_date", end)
    .order("document_date", { ascending: false })
    .limit(5000);
  return data ?? [];
}

async function fetchOrders(admin: SupabaseAdmin, start: string, end: string) {
  const { data } = await admin
    .from("orders")
    .select("id,total,currency,status,created_at")
    .gte("created_at", `${start}T00:00:00Z`)
    .lte("created_at", `${end}T23:59:59Z`)
    .limit(10000);
  return data ?? [];
}

function sumBy<T>(rows: T[], f: (r: T) => number): number {
  return rows.reduce((a, r) => a + (Number(f(r)) || 0), 0);
}

function shell(title: string, subtitle: string, bodyHtml: string, meta: Record<string, string>): string {
  const metaHtml = Object.entries(meta).map(([k, v]) => `<div><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${esc(title)} · GetPawsy CFO</title>
<style>
:root{--bg:#0b0f1a;--card:#111827;--muted:#94a3b8;--fg:#f8fafc;--acc:#f59e0b;--border:#1f2937}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;padding:32px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:32px 0 12px;border-bottom:1px solid var(--border);padding-bottom:6px}
.sub{color:var(--muted);margin-bottom:20px}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px 16px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:24px}
.meta .k{color:var(--muted);display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
.meta .v{font-weight:600}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:16px 0 24px}
.kpi{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px}
.kpi .l{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
.kpi .n{font-size:22px;font-weight:700;color:var(--acc);margin-top:6px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--border);border-radius:10px;overflow:hidden}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--border);font-size:13px}
th{background:#0f172a;color:var(--muted);text-transform:uppercase;font-size:11px;letter-spacing:.05em}
tr:last-child td{border-bottom:none}.num{text-align:right;font-variant-numeric:tabular-nums}
.footer{margin-top:40px;color:var(--muted);font-size:12px;border-top:1px solid var(--border);padding-top:16px}
@media print{body{background:#fff;color:#111}.kpi,.meta,table{background:#fff;border-color:#ddd}.kpi .n{color:#b45309}}
</style></head><body>
<h1>${esc(title)}</h1><div class="sub">${esc(subtitle)}</div>
<div class="meta">${metaHtml}</div>
${bodyHtml}
<div class="footer">Generated by GetPawsy CFO Report Library · ${new Date().toISOString()}</div>
</body></html>`;
}

function tableRows(rows: Array<Record<string, string | number>>, cols: Array<{ k: string; label: string; num?: boolean }>): string {
  if (!rows.length) return `<div class="sub">No data in this period.</div>`;
  const head = cols.map((c) => `<th class="${c.num ? "num" : ""}">${esc(c.label)}</th>`).join("");
  const body = rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? "num" : ""}">${esc(r[c.k])}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

async function buildFinancialPeriod(admin: SupabaseAdmin, rt: ReportType, start: string, end: string, label: string) {
  const [docs, orders] = await Promise.all([fetchDocs(admin, start, end), fetchOrders(admin, start, end)]);
  const invoices = docs.filter((d) => (d.document_type ?? "").toLowerCase() === "invoice" || (d.category ?? "").toLowerCase() === "invoice");
  const receipts = docs.filter((d) => (d.document_type ?? "").toLowerCase() === "receipt");
  const totalExpense = sumBy(docs, (d) => d.amount_minor ?? 0);
  const totalVat = sumBy(docs, (d) => d.vat_minor ?? 0);
  const revenue = sumBy(orders, (o) => Math.round(Number(o.total ?? 0) * 100));
  const paidOrders = orders.filter((o) => (o.status ?? "").toLowerCase() === "paid" || (o.status ?? "").toLowerCase() === "completed");
  const paidRevenue = sumBy(paidOrders, (o) => Math.round(Number(o.total ?? 0) * 100));

  const bySupplier: Record<string, { spend: number; vat: number; count: number }> = {};
  for (const d of docs) {
    const k = d.supplier_name ?? "(unknown)";
    (bySupplier[k] ??= { spend: 0, vat: 0, count: 0 });
    bySupplier[k].spend += d.amount_minor ?? 0;
    bySupplier[k].vat += d.vat_minor ?? 0;
    bySupplier[k].count += 1;
  }
  const topSuppliers = Object.entries(bySupplier)
    .sort((a, b) => b[1].spend - a[1].spend)
    .slice(0, 25)
    .map(([name, v]) => ({ supplier: name, docs: v.count, spend: fmtMoney(v.spend), vat: fmtMoney(v.vat) }));

  const summary = {
    period: { start, end, label },
    revenue_minor: revenue,
    paid_revenue_minor: paidRevenue,
    expense_minor: totalExpense,
    vat_minor: totalVat,
    net_minor: paidRevenue - totalExpense,
    orders_count: orders.length,
    paid_orders_count: paidOrders.length,
    invoices_count: invoices.length,
    receipts_count: receipts.length,
    documents_count: docs.length,
    top_suppliers: topSuppliers.slice(0, 10).map((s) => ({ supplier: s.supplier, spend: s.spend, docs: s.docs })),
  };

  const kpis = `
<div class="kpis">
  <div class="kpi"><div class="l">Revenue (paid)</div><div class="n">${fmtMoney(paidRevenue)}</div></div>
  <div class="kpi"><div class="l">Total expense</div><div class="n">${fmtMoney(totalExpense)}</div></div>
  <div class="kpi"><div class="l">VAT recorded</div><div class="n">${fmtMoney(totalVat)}</div></div>
  <div class="kpi"><div class="l">Net</div><div class="n">${fmtMoney(paidRevenue - totalExpense)}</div></div>
  <div class="kpi"><div class="l">Orders</div><div class="n">${orders.length}</div></div>
  <div class="kpi"><div class="l">Invoices</div><div class="n">${invoices.length}</div></div>
</div>`;

  const body = `${kpis}
<h2>Top suppliers by spend</h2>
${tableRows(topSuppliers, [
  { k: "supplier", label: "Supplier" },
  { k: "docs", label: "Docs", num: true },
  { k: "spend", label: "Spend", num: true },
  { k: "vat", label: "VAT", num: true },
])}
<h2>Recent documents (max 100)</h2>
${tableRows(docs.slice(0, 100).map((d) => ({
  date: d.document_date ?? "",
  supplier: d.supplier_name ?? "",
  title: d.title ?? "",
  type: d.document_type ?? "",
  amount: fmtMoney(d.amount_minor ?? 0, d.currency ?? "EUR"),
  vat: fmtMoney(d.vat_minor ?? 0, d.currency ?? "EUR"),
})), [
  { k: "date", label: "Date" },
  { k: "supplier", label: "Supplier" },
  { k: "title", label: "Title" },
  { k: "type", label: "Type" },
  { k: "amount", label: "Amount", num: true },
  { k: "vat", label: "VAT", num: true },
])}`;

  return { summary, body };
}

async function buildCategorySpending(admin: SupabaseAdmin, matcher: RegExp, label: string, start: string, end: string) {
  const docs = (await fetchDocs(admin, start, end)).filter((d) => matcher.test(d.supplier_name ?? "") || matcher.test(d.title ?? "") || matcher.test(d.category ?? ""));
  const total = sumBy(docs, (d) => d.amount_minor ?? 0);
  const vat = sumBy(docs, (d) => d.vat_minor ?? 0);
  const bySupplier: Record<string, number> = {};
  for (const d of docs) { const k = d.supplier_name ?? "(unknown)"; bySupplier[k] = (bySupplier[k] ?? 0) + (d.amount_minor ?? 0); }
  const top = Object.entries(bySupplier).sort((a, b) => b[1] - a[1]).map(([s, a]) => ({ supplier: s, spend: fmtMoney(a) }));

  const summary = {
    period: { start, end, label },
    total_spend_minor: total,
    vat_minor: vat,
    documents_count: docs.length,
    by_supplier: Object.entries(bySupplier).map(([s, a]) => ({ supplier: s, spend_minor: a })),
  };
  const body = `<div class="kpis">
  <div class="kpi"><div class="l">Total spend</div><div class="n">${fmtMoney(total)}</div></div>
  <div class="kpi"><div class="l">VAT included</div><div class="n">${fmtMoney(vat)}</div></div>
  <div class="kpi"><div class="l">Documents</div><div class="n">${docs.length}</div></div>
</div>
<h2>By supplier</h2>${tableRows(top, [{ k: "supplier", label: "Supplier" }, { k: "spend", label: "Spend", num: true }])}
<h2>Documents</h2>${tableRows(docs.map((d) => ({
  date: d.document_date ?? "", supplier: d.supplier_name ?? "", title: d.title ?? "",
  amount: fmtMoney(d.amount_minor ?? 0, d.currency ?? "EUR"), vat: fmtMoney(d.vat_minor ?? 0, d.currency ?? "EUR"),
  invoice: d.invoice_number ?? "",
})), [
  { k: "date", label: "Date" }, { k: "supplier", label: "Supplier" }, { k: "title", label: "Title" },
  { k: "invoice", label: "Invoice #" }, { k: "amount", label: "Amount", num: true }, { k: "vat", label: "VAT", num: true },
])}`;
  return { summary, body };
}

async function buildAssets(admin: SupabaseAdmin) {
  const { data } = await admin.from("finance_assets").select("*").order("purchase_date", { ascending: false }).limit(2000);
  const rows = data ?? [];
  const totalCost = sumBy(rows, (r) => r.purchase_amount_cents ?? 0);
  const totalBook = sumBy(rows, (r) => r.current_book_value_cents ?? 0);
  const active = rows.filter((r) => (r.asset_status ?? "active") === "active").length;
  const body = `<div class="kpis">
  <div class="kpi"><div class="l">Total cost</div><div class="n">${fmtMoney(totalCost)}</div></div>
  <div class="kpi"><div class="l">Book value</div><div class="n">${fmtMoney(totalBook)}</div></div>
  <div class="kpi"><div class="l">Registered assets</div><div class="n">${rows.length}</div></div>
  <div class="kpi"><div class="l">Active</div><div class="n">${active}</div></div>
</div>
<h2>Asset register</h2>${tableRows(rows.map((r) => ({
  date: r.purchase_date ?? "", name: r.name ?? "", category: r.category ?? "",
  cost: fmtMoney(r.purchase_amount_cents ?? 0, r.currency ?? "EUR"),
  book: fmtMoney(r.current_book_value_cents ?? 0, r.currency ?? "EUR"),
  use: `${r.business_usage_pct ?? 100}%`, status: r.asset_status ?? "active",
})), [
  { k: "date", label: "Purchased" }, { k: "name", label: "Asset" }, { k: "category", label: "Category" },
  { k: "use", label: "Business use", num: true }, { k: "cost", label: "Cost", num: true },
  { k: "book", label: "Book value", num: true }, { k: "status", label: "Status" },
])}`;
  const summary = { total_cost_minor: totalCost, total_book_minor: totalBook, count: rows.length, active };
  return { summary, body };
}

async function buildSuppliers(admin: SupabaseAdmin, start: string, end: string) {
  const [suppliersRes, docs] = await Promise.all([
    admin.from("evidence_suppliers").select("*").limit(2000),
    fetchDocs(admin, start, end),
  ]);
  const suppliers = suppliersRes.data ?? [];
  const spendMap: Record<string, { spend: number; vat: number; count: number }> = {};
  for (const d of docs) { const k = (d.supplier_name ?? "").toLowerCase(); (spendMap[k] ??= { spend: 0, vat: 0, count: 0 }); spendMap[k].spend += d.amount_minor ?? 0; spendMap[k].vat += d.vat_minor ?? 0; spendMap[k].count += 1; }

  const rows = suppliers.map((s) => {
    const k = (s.name ?? "").toLowerCase();
    const sp = spendMap[k] ?? { spend: 0, vat: 0, count: 0 };
    return {
      supplier: s.name ?? "",
      country: s.country ?? "",
      health: `${s.health_score ?? "—"}`,
      risk: `${s.risk_score ?? "—"}`,
      complete: `${s.invoice_completeness_pct ?? "—"}%`,
      docs_period: sp.count,
      spend_period: fmtMoney(sp.spend),
    };
  }).sort((a, b) => (b.docs_period || 0) - (a.docs_period || 0));

  const body = `<div class="kpis">
  <div class="kpi"><div class="l">Suppliers</div><div class="n">${suppliers.length}</div></div>
  <div class="kpi"><div class="l">Active in period</div><div class="n">${Object.values(spendMap).filter((s) => s.count > 0).length}</div></div>
  <div class="kpi"><div class="l">Period spend</div><div class="n">${fmtMoney(sumBy(Object.values(spendMap), (s) => s.spend))}</div></div>
</div>
<h2>Supplier scorecard</h2>${tableRows(rows, [
  { k: "supplier", label: "Supplier" }, { k: "country", label: "Country" },
  { k: "health", label: "Health", num: true }, { k: "risk", label: "Risk", num: true },
  { k: "complete", label: "Invoice completeness", num: true },
  { k: "docs_period", label: "Docs (period)", num: true }, { k: "spend_period", label: "Spend (period)", num: true },
])}`;
  return { summary: { suppliers_count: suppliers.length, active: Object.values(spendMap).filter((s) => s.count > 0).length }, body };
}

async function buildTaxReadiness(admin: SupabaseAdmin, start: string, end: string) {
  const [docs, vatRes, reconRes, anomRes] = await Promise.all([
    fetchDocs(admin, start, end),
    admin.from("finance_vat_summaries").select("*").order("period_year", { ascending: false }).order("period_number", { ascending: false }).limit(20),
    admin.from("finance_vat_reconciliations").select("*").order("created_at", { ascending: false }).limit(20),
    admin.from("finance_anomalies").select("id,type,severity,status,message,created_at").eq("status", "open").limit(200),
  ]);
  const missing = docs.filter((d) => (d.amount_minor ?? 0) > 0 && !(d.vat_minor ?? 0));
  const nl = docs.filter((d) => (d.tax_country ?? "").toUpperCase() === "NL");
  const nlVat = sumBy(nl, (d) => d.vat_minor ?? 0);
  const otherVat = sumBy(docs.filter((d) => (d.tax_country ?? "").toUpperCase() !== "NL"), (d) => d.vat_minor ?? 0);
  const anomalies = anomRes.data ?? [];
  const vatSum = vatRes.data ?? [];
  const recon = reconRes.data ?? [];

  const body = `<div class="kpis">
  <div class="kpi"><div class="l">Recoverable VAT (NL)</div><div class="n">${fmtMoney(nlVat)}</div></div>
  <div class="kpi"><div class="l">Non-recoverable VAT</div><div class="n">${fmtMoney(otherVat)}</div></div>
  <div class="kpi"><div class="l">Docs missing VAT</div><div class="n">${missing.length}</div></div>
  <div class="kpi"><div class="l">Open anomalies</div><div class="n">${anomalies.length}</div></div>
</div>
<h2>VAT summaries on file</h2>${tableRows(vatSum.map((v) => ({
  period: `${v.period_year} ${v.period_type === "quarter" ? "Q" + v.period_number : v.period_number ?? ""}`,
  gross: fmtMoney(v.gross_minor ?? 0), vat: fmtMoney(v.vat_minor ?? 0),
  status: v.status ?? "", generated: (v.created_at ?? "").slice(0, 10),
})), [
  { k: "period", label: "Period" }, { k: "gross", label: "Gross", num: true }, { k: "vat", label: "VAT", num: true },
  { k: "status", label: "Status" }, { k: "generated", label: "Generated" },
])}
<h2>Latest reconciliations</h2>${tableRows(recon.map((r) => ({
  period: `${r.period_year} Q${r.period_number ?? ""}`,
  calc: fmtMoney(r.calculated_vat_minor ?? 0), imp: fmtMoney(r.imported_vat_minor ?? 0),
  delta: fmtMoney((r.calculated_vat_minor ?? 0) - (r.imported_vat_minor ?? 0)),
  status: r.status ?? "", when: (r.created_at ?? "").slice(0, 10),
})), [
  { k: "period", label: "Period" }, { k: "calc", label: "Calculated", num: true }, { k: "imp", label: "Imported", num: true },
  { k: "delta", label: "Δ", num: true }, { k: "status", label: "Status" }, { k: "when", label: "When" },
])}
<h2>Docs missing VAT (top 50)</h2>${tableRows(missing.slice(0, 50).map((d) => ({
  date: d.document_date ?? "", supplier: d.supplier_name ?? "", title: d.title ?? "",
  amount: fmtMoney(d.amount_minor ?? 0, d.currency ?? "EUR"),
})), [
  { k: "date", label: "Date" }, { k: "supplier", label: "Supplier" }, { k: "title", label: "Title" }, { k: "amount", label: "Amount", num: true },
])}
<h2>Open anomalies (top 100)</h2>${tableRows(anomalies.slice(0, 100).map((a) => ({
  type: a.type ?? "", severity: a.severity ?? "", message: a.message ?? "", when: (a.created_at ?? "").slice(0, 10),
})), [
  { k: "type", label: "Type" }, { k: "severity", label: "Severity" }, { k: "message", label: "Detail" }, { k: "when", label: "Detected" },
])}`;
  const summary = {
    period: { start, end },
    recoverable_vat_minor: nlVat, non_recoverable_vat_minor: otherVat,
    missing_vat_docs: missing.length, open_anomalies: anomalies.length,
    vat_summaries_on_file: vatSum.length,
  };
  return { summary, body };
}

async function generate(admin: SupabaseAdmin, uid: string, body: GenerateBody) {
  const rt = body.report_type as ReportType;
  if (!rt || !(rt in REPORT_META)) return json(400, { error: "invalid_report_type" });
  const meta = REPORT_META[rt];
  const range = resolveRange(rt, body);
  const { start, end, label, periodYear, periodNumber } = range;

  let built: { summary: Record<string, unknown>; body: string };
  if (rt === "monthly" || rt === "quarterly" || rt === "annual" || rt === "lifetime") {
    built = await buildFinancialPeriod(admin, rt, start, end, label);
  } else if (rt === "ai_spending") {
    built = await buildCategorySpending(admin, AI_MATCH, label, start, end);
  } else if (rt === "infrastructure") {
    built = await buildCategorySpending(admin, INFRA_MATCH, label, start, end);
  } else if (rt === "assets") {
    built = await buildAssets(admin);
  } else if (rt === "suppliers") {
    built = await buildSuppliers(admin, start, end);
  } else {
    built = await buildTaxReadiness(admin, start, end);
  }

  const title = `${meta.title} · ${label}`;
  const metaLine: Record<string, string> = {
    "Report type": rt, Period: label, "Range start": start, "Range end": end,
    "Generated at": new Date().toISOString(), "Generated by": uid,
  };
  const html = shell(title, meta.blurb, built.body, metaLine);
  const htmlBytes = new TextEncoder().encode(html);
  const jsonBytes = new TextEncoder().encode(JSON.stringify({ report_type: rt, title, period: { start, end, label }, generated_at: new Date().toISOString(), summary: built.summary }, null, 2));
  const sha = await sha256Hex(htmlBytes);
  const pathBase = `cfo-reports/${rt}/${label}-${sha.slice(0, 12)}`;
  const htmlPath = `${pathBase}.html`;
  const jsonPath = `${pathBase}.json`;

  const [up1, up2] = await Promise.all([
    admin.storage.from(BUCKET).upload(htmlPath, htmlBytes, { contentType: "text/html; charset=utf-8", upsert: true }),
    admin.storage.from(BUCKET).upload(jsonPath, jsonBytes, { contentType: "application/json", upsert: true }),
  ]);
  if (up1.error) return json(500, { error: "upload_failed", detail: up1.error.message });
  if (up2.error) return json(500, { error: "upload_failed_json", detail: up2.error.message });

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(htmlPath, 60 * 60 * 24 * 30);
  const { data: signedJson } = await admin.storage.from(BUCKET).createSignedUrl(jsonPath, 60 * 60 * 24 * 30);

  const insert = await admin.from("finance_reports").insert({
    report_type: rt,
    period_year: periodYear,
    period_number: periodNumber,
    title,
    storage_path: htmlPath,
    public_path: signed?.signedUrl ?? null,
    sha256: sha,
    file_size: htmlBytes.byteLength,
    summary: { ...built.summary, json_path: jsonPath, json_signed_url: signedJson?.signedUrl ?? null, blurb: meta.blurb },
    generated_at: new Date().toISOString(),
  }).select("*").maybeSingle();

  if (insert.error) return json(500, { error: "insert_failed", detail: insert.error.message });
  return json(200, { ok: true, report: insert.data, signed_url: signed?.signedUrl, json_signed_url: signedJson?.signedUrl });
}

async function list(admin: SupabaseAdmin) {
  const { data, error } = await admin.from("finance_reports")
    .select("id,report_type,period_year,period_number,title,storage_path,public_path,sha256,file_size,summary,generated_at,created_at")
    .order("generated_at", { ascending: false }).limit(500);
  if (error) return json(500, { error: error.message });
  // Refresh signed URLs (public_path may be expired). Sign in bulk.
  const refreshed = await Promise.all((data ?? []).map(async (r) => {
    const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(r.storage_path, 60 * 60 * 24 * 7);
    const jsonPath = (r.summary as { json_path?: string } | null)?.json_path;
    let jsonUrl: string | null = null;
    if (jsonPath) {
      const { data: sj } = await admin.storage.from(BUCKET).createSignedUrl(jsonPath, 60 * 60 * 24 * 7);
      jsonUrl = sj?.signedUrl ?? null;
    }
    return { ...r, signed_url: s?.signedUrl ?? null, json_signed_url: jsonUrl };
  }));
  return json(200, { ok: true, reports: refreshed });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json(401, { error: "unauthorized" });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData } = await admin.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return json(401, { error: "unauthorized" });
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (!isAdmin) return json(403, { error: "forbidden" });

    const body = (await req.json().catch(() => ({}))) as GenerateBody;
    if (body.action === "list") return await list(admin);
    return await generate(admin, uid, body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { error: "server_error", detail: msg });
  }
});
