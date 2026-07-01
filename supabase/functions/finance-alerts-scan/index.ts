// GENESIS V14 — finance-alerts-scan
// Scans the finance ecosystem and (idempotently) creates open alerts for:
//  warranty_expiring   — finance_assets.warranty_until within 30d
//  subscription_renewing — finance_subscriptions.renews_at within 14d
//  price_increase      — finance_subscriptions with last price_history jump > 10%
//  unknown_supplier    — evidence_documents.supplier_id IS NULL, last 90d
//  asset_incomplete    — finance_assets without a linked invoice
//  invoice_missing     — evidence_payments without a linked evidence_document
//  duplicate_payment   — evidence_payments same supplier+amount+date > 1
//
// Emits one row per (alert_type, subject_id) at most (dedup on scan run).

import { createClient } from "npm:@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Alert = {
  alert_type: string;
  severity: "info" | "warning" | "critical";
  subject_type: string | null;
  subject_id: string | null;
  title: string;
  detail: string;
  metadata?: Record<string, unknown>;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const alerts: Alert[] = [];

  // 1. warranty_expiring
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  const { data: warr } = await admin
    .from("finance_assets")
    .select("id,name,warranty_until")
    .not("warranty_until", "is", null)
    .lte("warranty_until", soon.toISOString().slice(0, 10))
    .in("asset_status", ["active", "repair"]);
  for (const a of warr ?? []) alerts.push({
    alert_type: "warranty_expiring",
    severity: "warning",
    subject_type: "finance_assets",
    subject_id: a.id,
    title: `Warranty expiring: ${a.name}`,
    detail: `Warranty ends ${a.warranty_until}`,
  });

  // 2. subscription_renewing (14d)
  const renewSoon = new Date();
  renewSoon.setDate(renewSoon.getDate() + 14);
  const { data: subs } = await admin
    .from("finance_subscriptions")
    .select("id,product_name,renews_at,amount_minor,currency,price_history")
    .eq("is_active", true)
    .not("renews_at", "is", null)
    .lte("renews_at", renewSoon.toISOString().slice(0, 10));
  for (const s of subs ?? []) alerts.push({
    alert_type: "subscription_renewing",
    severity: "info",
    subject_type: "finance_subscriptions",
    subject_id: s.id,
    title: `Renewing: ${s.product_name}`,
    detail: `${(Number(s.amount_minor) / 100).toFixed(2)} ${s.currency} on ${s.renews_at}`,
  });

  // 3. price_increase (>10% latest vs prior)
  const { data: allSubs } = await admin
    .from("finance_subscriptions")
    .select("id,product_name,amount_minor,currency,price_history")
    .eq("is_active", true);
  for (const s of allSubs ?? []) {
    const hist = Array.isArray(s.price_history) ? s.price_history : [];
    if (hist.length < 2) continue;
    const last = Number(hist[hist.length - 1]?.amount_minor ?? s.amount_minor);
    const prev = Number(hist[hist.length - 2]?.amount_minor ?? last);
    if (prev > 0 && (last - prev) / prev > 0.1) {
      alerts.push({
        alert_type: "price_increase",
        severity: "warning",
        subject_type: "finance_subscriptions",
        subject_id: s.id,
        title: `Price increased: ${s.product_name}`,
        detail: `${(prev / 100).toFixed(2)} → ${(last / 100).toFixed(2)} ${s.currency}`,
        metadata: { prev, last },
      });
    }
  }

  // 4. unknown_supplier (last 90d)
  const since = new Date(); since.setDate(since.getDate() - 90);
  const { data: unk } = await admin
    .from("evidence_documents")
    .select("id,original_filename,title,document_date")
    .is("supplier_id", null)
    .gte("document_date", since.toISOString().slice(0, 10))
    .limit(200);
  for (const d of unk ?? []) alerts.push({
    alert_type: "unknown_supplier",
    severity: "info",
    subject_type: "evidence_documents",
    subject_id: d.id,
    title: `Unlinked supplier: ${d.original_filename ?? d.title ?? "document"}`,
    detail: `Document date ${d.document_date ?? "unknown"}`,
  });

  // 5. asset_incomplete (no linked invoice)
  const { data: assets } = await admin
    .from("finance_assets")
    .select("id,name,finance_asset_documents(id,role)")
    .in("asset_status", ["active", "repair"]);
  for (const a of assets ?? []) {
    const docs = (a as any).finance_asset_documents ?? [];
    const hasInvoice = docs.some((d: any) => d.role === "invoice");
    if (!hasInvoice) alerts.push({
      alert_type: "asset_incomplete",
      severity: "warning",
      subject_type: "finance_assets",
      subject_id: a.id,
      title: `Asset missing invoice: ${a.name}`,
      detail: "Upload the purchase invoice to complete the record.",
    });
  }

  // 6. invoice_missing on payments
  const { data: pays } = await admin
    .from("evidence_payments")
    .select("id,amount_minor,currency,paid_at,invoice_document_id,supplier_id")
    .is("invoice_document_id", null)
    .limit(500);
  for (const p of pays ?? []) alerts.push({
    alert_type: "invoice_missing",
    severity: "warning",
    subject_type: "evidence_payments",
    subject_id: p.id,
    title: `Payment without invoice`,
    detail: `${(Number(p.amount_minor) / 100).toFixed(2)} ${p.currency ?? ""} on ${p.paid_at ?? ""}`,
  });

  // 7. duplicate_payment (same supplier, amount, date)
  const { data: allPays } = await admin
    .from("evidence_payments")
    .select("id,supplier_id,amount_minor,paid_at");
  const seen = new Map<string, string[]>();
  for (const p of allPays ?? []) {
    if (!p.supplier_id || !p.amount_minor || !p.paid_at) continue;
    const k = `${p.supplier_id}|${p.amount_minor}|${p.paid_at}`;
    const arr = seen.get(k) ?? [];
    arr.push(p.id);
    seen.set(k, arr);
  }
  for (const [k, ids] of seen) {
    if (ids.length > 1) alerts.push({
      alert_type: "duplicate_payment",
      severity: "critical",
      subject_type: "evidence_payments",
      subject_id: ids[0],
      title: `Duplicate payment suspected`,
      detail: `${ids.length} payments share supplier/amount/date`,
      metadata: { key: k, payment_ids: ids },
    });
  }

  // Idempotent write: for each (alert_type, subject_id), skip if an OPEN alert exists.
  let inserted = 0;
  for (const a of alerts) {
    const { data: existing } = await admin
      .from("finance_alerts")
      .select("id")
      .eq("alert_type", a.alert_type)
      .eq("subject_id", a.subject_id ?? "")
      .eq("is_resolved", false)
      .limit(1)
      .maybeSingle();
    if (existing) continue;
    const { error } = await admin.from("finance_alerts").insert({
      alert_type: a.alert_type,
      severity: a.severity,
      subject_type: a.subject_type,
      subject_id: a.subject_id,
      title: a.title,
      detail: a.detail,
      metadata: a.metadata ?? {},
    });
    if (!error) inserted += 1;
  }

  return json({ ok: true, scanned: alerts.length, inserted });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
