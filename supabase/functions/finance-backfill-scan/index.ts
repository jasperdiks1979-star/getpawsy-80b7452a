// Admin backfill task queue scanner.
// Walks known financial sources (orders, subscriptions, ad_spend, evidence_payments)
// and creates Missing Document tasks when no evidence_documents row can be matched.
// A lightweight auto-recover pass tries to link tasks by reference/invoice_number
// before creating an open task.
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type TaskRow = {
  source_type: string;
  source_id: string;
  supplier_hint: string | null;
  reference: string | null;
  document_date: string | null;
  amount_minor: number | null;
  currency: string | null;
  priority: string;
  reason: string;
  auto_recover_attempted: boolean;
  auto_recover_result: string | null;
  linked_document_id: string | null;
  status: string;
  metadata: Record<string, unknown>;
};

function normRef(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = await requireInternalOrAdmin(req);
  if (denied) return denied;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* optional */ }
  const dryRun = body.dry_run === true;
  const sources = Array.isArray(body.sources) && body.sources.length
    ? (body.sources as string[])
    : ["order", "subscription", "ad_spend", "payment"];

  const { data: scanRow, error: scanErr } = await supabase
    .from("finance_backfill_scans")
    .insert({ status: "running", scanned_sources: sources, metadata: { dry_run: dryRun } })
    .select("id").single();
  if (scanErr) {
    return new Response(JSON.stringify({ ok: false, error: scanErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const scanId = scanRow!.id as string;

  const stats = { candidates: 0, auto: 0, created: 0, updated: 0 };
  const tasks: TaskRow[] = [];

  // Preload existing evidence references for cheap matching.
  const { data: evAll } = await supabase
    .from("evidence_documents")
    .select("id, invoice_number, reference, metadata, amount_minor, document_date")
    .limit(10000);
  const byRef = new Map<string, string>();
  for (const d of evAll ?? []) {
    for (const k of [d.invoice_number, d.reference]) {
      const n = normRef(k);
      if (n) byRef.set(n.toLowerCase(), d.id);
    }
  }
  const linkedDocIds = new Set<string>();

  function pushTask(t: TaskRow) {
    stats.candidates++;
    const ref = normRef(t.reference);
    if (ref) {
      const match = byRef.get(ref.toLowerCase());
      if (match) {
        stats.auto++;
        t.auto_recover_attempted = true;
        t.auto_recover_result = "matched_by_reference";
        t.linked_document_id = match;
        t.status = "resolved";
        linkedDocIds.add(match);
      }
    }
    tasks.push(t);
  }

  // 1. Orders (Stripe) → expect a stripe_charge or invoice document.
  if (sources.includes("order")) {
    const { data } = await supabase
      .from("orders")
      .select("id, stripe_payment_intent_id, stripe_session_id, total_amount, currency, created_at, status")
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(1000);
    for (const o of data ?? []) {
      const ref = o.stripe_payment_intent_id || o.stripe_session_id;
      pushTask({
        source_type: "order",
        source_id: o.id,
        supplier_hint: "Stripe",
        reference: ref,
        document_date: o.created_at?.slice(0, 10) ?? null,
        amount_minor: o.total_amount != null ? Math.round(Number(o.total_amount) * 100) : null,
        currency: (o.currency ?? "USD").toUpperCase(),
        priority: "high",
        reason: "No matching evidence_document for paid order",
        auto_recover_attempted: false,
        auto_recover_result: null,
        linked_document_id: null,
        status: "open",
        metadata: { origin: "orders" },
      });
    }
  }

  // 2. Subscriptions.
  if (sources.includes("subscription")) {
    const { data } = await supabase
      .from("finance_subscriptions")
      .select("id, supplier_slug, product_name, amount_minor, currency, renews_at, last_seen_at, is_active")
      .eq("is_active", true).limit(500);
    for (const s of data ?? []) {
      pushTask({
        source_type: "subscription",
        source_id: s.id,
        supplier_hint: s.supplier_slug,
        reference: s.product_name,
        document_date: s.last_seen_at?.slice(0, 10) ?? null,
        amount_minor: s.amount_minor ?? null,
        currency: s.currency ?? "USD",
        priority: "medium",
        reason: "Recurring subscription without recent invoice document",
        auto_recover_attempted: false, auto_recover_result: null,
        linked_document_id: null, status: "open",
        metadata: { origin: "finance_subscriptions" },
      });
    }
  }

  // 3. Ad spend entries.
  if (sources.includes("ad_spend")) {
    const { data } = await supabase
      .from("ad_spend_entries")
      .select("id, platform, entry_date, spend, campaign")
      .order("entry_date", { ascending: false }).limit(1000);
    // Aggregate by platform+month → one task per invoice period.
    const seen = new Set<string>();
    for (const a of data ?? []) {
      const month = (a.entry_date ?? "").slice(0, 7);
      if (!month) continue;
      const key = `${a.platform}:${month}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pushTask({
        source_type: "ad_spend",
        source_id: key,
        supplier_hint: a.platform,
        reference: `${a.platform}-${month}`,
        document_date: `${month}-01`,
        amount_minor: null,
        currency: "USD",
        priority: "medium",
        reason: "Monthly ad-spend invoice not archived",
        auto_recover_attempted: false, auto_recover_result: null,
        linked_document_id: null, status: "open",
        metadata: { origin: "ad_spend_entries", month, platform: a.platform },
      });
    }
  }

  // 4. Evidence payments missing invoice/receipt links.
  if (sources.includes("payment")) {
    const { data } = await supabase
      .from("evidence_payments")
      .select("id, provider, amount_minor, currency, paid_at, bank_txn_reference, invoice_document_id, receipt_document_id, supplier_id")
      .is("invoice_document_id", null)
      .limit(1000);
    for (const p of data ?? []) {
      pushTask({
        source_type: "payment",
        source_id: p.id,
        supplier_hint: p.provider,
        reference: p.bank_txn_reference,
        document_date: p.paid_at?.slice(0, 10) ?? null,
        amount_minor: p.amount_minor ?? null,
        currency: p.currency ?? "USD",
        priority: "high",
        reason: "Payment without linked invoice document",
        auto_recover_attempted: false, auto_recover_result: null,
        linked_document_id: null, status: "open",
        metadata: { origin: "evidence_payments", supplier_id: p.supplier_id ?? null },
      });
    }
  }

  if (!dryRun && tasks.length) {
    // Upsert in chunks.
    const chunk = 200;
    for (let i = 0; i < tasks.length; i += chunk) {
      const slice = tasks.slice(i, i + chunk).map((t) => ({
        ...t,
        resolved_at: t.status === "resolved" ? new Date().toISOString() : null,
      }));
      const { data: up, error: upErr } = await supabase
        .from("finance_backfill_tasks")
        .upsert(slice, { onConflict: "source_type,source_id", ignoreDuplicates: false })
        .select("id, created_at, updated_at");
      if (upErr) {
        await supabase.from("finance_backfill_scans").update({
          status: "failed", finished_at: new Date().toISOString(),
          error_message: upErr.message, candidates_seen: stats.candidates,
          auto_recovered: stats.auto,
        }).eq("id", scanId);
        return new Response(JSON.stringify({ ok: false, error: upErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      for (const r of up ?? []) {
        if (r.created_at === r.updated_at) stats.created++; else stats.updated++;
      }
    }
  }

  await supabase.from("finance_backfill_scans").update({
    status: "success",
    finished_at: new Date().toISOString(),
    candidates_seen: stats.candidates,
    auto_recovered: stats.auto,
    tasks_created: stats.created,
    tasks_updated: stats.updated,
  }).eq("id", scanId);

  return new Response(JSON.stringify({
    ok: true, scan_id: scanId, dry_run: dryRun, ...stats,
    sample: tasks.slice(0, 10),
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});