// GENESIS V14.1 — finance-cfo-chat
// Natural-language CFO over the Financial Evidence Vault.
// Non-streaming JSON response: { answer, sources[] }
// Uses Lovable AI Gateway (google/gemini-3-flash-preview).

import { createClient } from "npm:@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

type ChatMsg = { role: "user" | "assistant" | "system"; content: string };
type Source = { type: string; id?: string; title: string; ref?: string };

function money(minor: number | null | undefined, ccy = "EUR") {
  const n = Number(minor ?? 0) / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy }).format(n);
}

function extractTerms(q: string): string {
  const words = q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["the", "and", "for", "with", "from", "show", "how", "much", "many", "what", "which", "all", "have", "spent", "cost", "costs", "please", "since"].includes(w))
    .slice(0, 8);
  if (words.length === 0) return "";
  return words.map((w) => `${w}:*`).join(" | ");
}

async function gatherContext(admin: ReturnType<typeof createClient>, question: string) {
  const sources: Source[] = [];
  const ctxParts: string[] = [];

  const tsQuery = extractTerms(question);

  // 1) Semantic-ish search over the finance index.
  let hits: any[] = [];
  if (tsQuery) {
    const { data } = await admin
      .from("finance_search_index")
      .select("entity_type, entity_id, title, body, metadata")
      .textSearch("tsv", tsQuery, { config: "simple" })
      .limit(25);
    hits = data ?? [];
  }
  if (hits.length === 0) {
    // Fallback: recent documents.
    const { data } = await admin
      .from("finance_search_index")
      .select("entity_type, entity_id, title, body, metadata")
      .order("updated_at", { ascending: false })
      .limit(20);
    hits = data ?? [];
  }

  ctxParts.push("### Matching evidence (top hits)");
  for (const h of hits) {
    const snip = (h.body ?? "").toString().slice(0, 300).replace(/\s+/g, " ");
    ctxParts.push(`- [${h.entity_type}#${(h.entity_id ?? "").slice(0, 8)}] ${h.title ?? ""} — ${snip}`);
    sources.push({ type: h.entity_type, id: h.entity_id, title: h.title ?? h.entity_type });
  }

  // 2) Supplier totals (top 20 by total spend across evidence_payments).
  const { data: suppliers } = await admin
    .from("evidence_suppliers")
    .select("id, name, category, country")
    .limit(200);
  const { data: pays } = await admin
    .from("evidence_payments")
    .select("supplier_id, amount_minor, currency, paid_at")
    .limit(5000);
  const byS = new Map<string, { name: string; total: number; ccy: string; count: number; last: string | null }>();
  for (const s of suppliers ?? []) byS.set(s.id, { name: s.name, total: 0, ccy: "EUR", count: 0, last: null });
  for (const p of pays ?? []) {
    const sid = p.supplier_id;
    if (!sid) continue;
    const bucket = byS.get(sid) ?? { name: "?", total: 0, ccy: "EUR", count: 0, last: null };
    bucket.total += Number(p.amount_minor ?? 0);
    bucket.count += 1;
    bucket.ccy = p.currency ?? bucket.ccy;
    if (!bucket.last || (p.paid_at && p.paid_at > bucket.last)) bucket.last = p.paid_at;
    byS.set(sid, bucket);
  }
  const topSuppliers = [...byS.values()].sort((a, b) => b.total - a.total).slice(0, 20).filter((s) => s.total > 0);
  if (topSuppliers.length) {
    ctxParts.push("\n### Top suppliers by lifetime spend");
    for (const s of topSuppliers) ctxParts.push(`- ${s.name}: ${money(s.total, s.ccy)} across ${s.count} payments (last ${s.last ?? "n/a"})`);
  }

  // 3) Active subscriptions.
  const { data: subs } = await admin
    .from("finance_subscriptions")
    .select("product_name, supplier_slug, amount_minor, currency, cadence, renews_at, is_active")
    .eq("is_active", true)
    .limit(100);
  if (subs && subs.length) {
    ctxParts.push("\n### Active subscriptions");
    for (const s of subs) ctxParts.push(`- ${s.supplier_slug ?? ""} — ${s.product_name ?? ""}: ${money(s.amount_minor, s.currency ?? "EUR")} / ${s.cadence ?? "monthly"} (renews ${s.renews_at ?? "?"})`);
  }

  // 4) VAT summaries.
  const { data: vat } = await admin
    .from("finance_vat_summaries")
    .select("period_type, period_year, period_number, vat_total_minor, recoverable_minor, reclaimed_minor, outstanding_minor, currency")
    .order("period_year", { ascending: false })
    .order("period_number", { ascending: false })
    .limit(8);
  if (vat && vat.length) {
    ctxParts.push("\n### VAT summaries (recent quarters)");
    for (const v of vat) ctxParts.push(`- ${v.period_type ?? "Q"} ${v.period_year}-${v.period_number}: total ${money(v.vat_total_minor, v.currency ?? "EUR")}, recoverable ${money(v.recoverable_minor, v.currency ?? "EUR")}, reclaimed ${money(v.reclaimed_minor, v.currency ?? "EUR")}, outstanding ${money(v.outstanding_minor, v.currency ?? "EUR")}`);
  }

  // 5) Assets summary.
  const { data: assets } = await admin
    .from("finance_assets")
    .select("name, category, purchase_date, purchase_amount_cents, current_book_value_cents, warranty_until, asset_status, currency")
    .order("purchase_date", { ascending: false })
    .limit(50);
  if (assets && assets.length) {
    ctxParts.push("\n### Company assets");
    for (const a of assets) ctxParts.push(`- ${a.name} (${a.category}, ${a.asset_status}): bought ${a.purchase_date ?? "?"} for ${money(a.purchase_amount_cents, a.currency ?? "EUR")}, book value ${money(a.current_book_value_cents, a.currency ?? "EUR")}${a.warranty_until ? `, warranty until ${a.warranty_until}` : ""}`);
  }

  // 6) Open alerts.
  const { data: alerts } = await admin
    .from("finance_alerts")
    .select("alert_type, severity, title, detail, created_at")
    .eq("is_resolved", false)
    .order("created_at", { ascending: false })
    .limit(20);
  if (alerts && alerts.length) {
    ctxParts.push("\n### Open financial alerts");
    for (const a of alerts) ctxParts.push(`- [${a.severity}] ${a.alert_type}: ${a.title} — ${a.detail ?? ""}`);
  }

  return { context: ctxParts.join("\n"), sources };
}

async function askGateway(system: string, history: ChatMsg[], user: string): Promise<string> {
  const body = {
    model: "google/gemini-3-flash-preview",
    messages: [
      { role: "system", content: system },
      ...history.slice(-8),
      { role: "user", content: user },
    ],
  };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 402) throw new Error("Lovable AI credits exhausted. Add credits in Workspace Usage.");
    if (res.status === 429) throw new Error("Lovable AI rate limit reached. Try again in a moment.");
    throw new Error(`AI gateway ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  try {
    const { question, history = [] } = await req.json();
    if (!question || typeof question !== "string") {
      return new Response(JSON.stringify({ error: "question required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { context, sources } = await gatherContext(admin, question);

    const system = [
      "You are the GetPawsy Digital CFO — an experienced finance officer with perfect memory of every invoice, payment, supplier, subscription, asset, VAT filing and financial alert in the company.",
      "Answer the user's question using ONLY the evidence in the CONTEXT below. If the answer cannot be supported by the evidence, say so plainly and suggest what to import next — never fabricate amounts or invoices.",
      "Always cite the specific supplier, amount and date when relevant. Use short markdown: headings, bullet lists, and a compact totals table when helpful. Format all monetary amounts with the currency symbol.",
      "Keep answers focused and concise. If the question is broad, give the headline number first, then a short breakdown.",
      "",
      "=== CONTEXT ===",
      context.slice(0, 30000),
    ].join("\n");

    const answer = await askGateway(system, history as ChatMsg[], question);

    return new Response(JSON.stringify({ answer, sources: sources.slice(0, 15) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[finance-cfo-chat]", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
