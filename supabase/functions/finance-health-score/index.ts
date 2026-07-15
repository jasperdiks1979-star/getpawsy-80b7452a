// Finance Health 2.0 — weighted, explainable health score.
// Reuses evidence_*, finance_import_tasks, finance_vat_summaries, finance_subscriptions,
// finance_anomalies, evidence_payments, finance_entities.
// Writes a snapshot into finance_health_scores (score_key='finance_health_v2') with a
// details JSON that carries per-category subscores + reasoning + recommended actions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Signal = {
  key: string;
  label: string;
  weight: number;      // 0..1
  score: number;       // 0..100
  reason: string;
  action?: string;
  details?: Record<string, unknown>;
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key);

    const body = await req.json().catch(() => ({}));
    const entityId: string | null = body.entity_id ?? null;
    const persist: boolean = body.persist !== false;

    // ---- Gather signal inputs in parallel ----------------------------------
    const eq = (q: any) => (entityId ? q.eq("entity_id", entityId) : q);

    const [
      docsCount, docsMissingVat, docsLowConf, docsUnknownSupplier,
      openTasks, importFailures90d,
      duplicateDocs, duplicatePays,
      paymentsCount, unmatchedPayments,
      subsExpired, subsWithoutInvoice,
      privateReview,
    ] = await Promise.all([
      eq(admin.from("evidence_documents").select("id", { count: "exact", head: true })),
      eq(admin.from("evidence_documents").select("id", { count: "exact", head: true }).is("vat_minor", null).not("amount_minor", "is", null)),
      eq(admin.from("evidence_documents").select("id", { count: "exact", head: true }).lt("classification_confidence", 0.7)),
      eq(admin.from("evidence_documents").select("id", { count: "exact", head: true }).is("supplier_id", null)),
      eq(admin.from("finance_import_tasks").select("id", { count: "exact", head: true }).eq("status", "open")),
      eq(admin.from("finance_import_tasks").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", new Date(Date.now() - 90 * 864e5).toISOString())),
      eq(admin.from("evidence_documents").select("id", { count: "exact", head: true }).not("is_duplicate_of", "is", null)),
      admin.from("evidence_payments").select("sha256").not("sha256", "is", null),
      eq(admin.from("evidence_payments").select("id", { count: "exact", head: true })),
      eq(admin.from("evidence_payments").select("id", { count: "exact", head: true }).is("invoice_document_id", null)),
      admin.from("finance_subscriptions").select("id", { count: "exact", head: true }).eq("status", "expired"),
      admin.from("finance_subscriptions").select("id", { count: "exact", head: true }).eq("has_invoice_evidence", false),
      admin.from("finance_anomalies").select("id", { count: "exact", head: true })
        .eq("anomaly_type", "possible_private_expense").eq("status", "open"),
    ]);

    const totalDocs = docsCount.count ?? 0;
    const totalPay = paymentsCount.count ?? 0;
    const totalUnmatchedPay = unmatchedPayments.count ?? 0;
    const openTaskCount = openTasks.count ?? 0;
    const missingVatCount = docsMissingVat.count ?? 0;
    const lowConfCount = docsLowConf.count ?? 0;
    const unknownSupCount = docsUnknownSupplier.count ?? 0;
    const failuresCount = importFailures90d.count ?? 0;
    const dupDocCount = duplicateDocs.count ?? 0;
    const subsExpiredCount = subsExpired.count ?? 0;
    const subsNoInv = subsWithoutInvoice.count ?? 0;
    const privateCount = privateReview.count ?? 0;

    // dup payments via sha256
    const paySha = (duplicatePays.data ?? []).map((r: any) => r.sha256).filter(Boolean);
    const dupPaySet = new Set<string>();
    const seen = new Set<string>();
    for (const h of paySha) {
      if (seen.has(h)) dupPaySet.add(h);
      else seen.add(h);
    }
    const dupPayCount = dupPaySet.size;

    const pct = (num: number, den: number) => (den <= 0 ? 100 : clamp(100 - (num / den) * 100));

    const signals: Signal[] = [
      { key: "missing_invoices",       label: "Missing invoices",         weight: 0.14,
        score: clamp(100 - openTaskCount * 4),
        reason: `${openTaskCount} open import task(s) awaiting invoice upload`,
        action: openTaskCount > 0 ? "Upload missing invoices from Import Center" : undefined },
      { key: "missing_receipts",       label: "Missing receipts",         weight: 0.06,
        score: pct(totalUnmatchedPay, Math.max(totalPay, 1)),
        reason: `${totalUnmatchedPay}/${totalPay} payments lack a linked invoice`,
        action: totalUnmatchedPay > 0 ? "Match unmatched bank payments to invoices" : undefined },
      { key: "unmatched_transactions", label: "Unmatched bank transactions", weight: 0.10,
        score: pct(totalUnmatchedPay, Math.max(totalPay, 1)),
        reason: `${totalUnmatchedPay} unmatched bank transactions`,
        action: totalUnmatchedPay > 0 ? "Review Import Center unmatched queue" : undefined },
      { key: "duplicate_payments",     label: "Duplicate payments",       weight: 0.06,
        score: clamp(100 - dupPayCount * 10),
        reason: `${dupPayCount} payment(s) with duplicated SHA-256`,
        action: dupPayCount > 0 ? "Consolidate duplicate payments" : undefined },
      { key: "duplicate_invoices",     label: "Duplicate invoices",       weight: 0.06,
        score: clamp(100 - dupDocCount * 8),
        reason: `${dupDocCount} invoice(s) flagged as duplicate`,
        action: dupDocCount > 0 ? "Resolve invoice duplicates" : undefined },
      { key: "vat_completeness",       label: "VAT completeness",         weight: 0.12,
        score: pct(missingVatCount, Math.max(totalDocs, 1)),
        reason: `${missingVatCount}/${totalDocs} documents missing VAT amount`,
        action: missingVatCount > 0 ? "Fill VAT via Tax Readiness Center" : undefined },
      { key: "supplier_confidence",    label: "Supplier confidence",      weight: 0.08,
        score: pct(lowConfCount, Math.max(totalDocs, 1)),
        reason: `${lowConfCount} document(s) with classification confidence < 70%`,
        action: lowConfCount > 0 ? "Review low-confidence classifications" : undefined },
      { key: "evidence_completeness",  label: "Evidence completeness",    weight: 0.08,
        score: pct(unknownSupCount + totalUnmatchedPay, Math.max(totalDocs + totalPay, 1)),
        reason: `${unknownSupCount} docs w/o supplier · ${totalUnmatchedPay} unmatched payments`,
        action: unknownSupCount + totalUnmatchedPay > 0 ? "Fix unknown suppliers & unmatched payments" : undefined },
      { key: "import_failures",        label: "Import failures (90d)",    weight: 0.06,
        score: clamp(100 - failuresCount * 5),
        reason: `${failuresCount} import failures in the last 90 days`,
        action: failuresCount > 0 ? "Retry failed imports" : undefined },
      { key: "open_finance_tasks",     label: "Open finance tasks",       weight: 0.06,
        score: clamp(100 - openTaskCount * 3),
        reason: `${openTaskCount} open tasks`,
        action: openTaskCount > 0 ? "Work through Missing Evidence panel" : undefined },
      { key: "unknown_suppliers",      label: "Unknown suppliers",        weight: 0.06,
        score: pct(unknownSupCount, Math.max(totalDocs, 1)),
        reason: `${unknownSupCount} documents without a supplier assignment`,
        action: unknownSupCount > 0 ? "Assign supplier from adapter registry" : undefined },
      { key: "expired_subscriptions",  label: "Expired subscriptions",    weight: 0.06,
        score: clamp(100 - subsExpiredCount * 6),
        reason: `${subsExpiredCount} subscriptions marked expired`,
        action: subsExpiredCount > 0 ? "Cancel or renew expired subscriptions" : undefined },
      { key: "private_expense_review", label: "Private purchase review",  weight: 0.06,
        score: clamp(100 - privateCount * 4),
        reason: `${privateCount} candidate private-purchase entries need review`,
        action: privateCount > 0 ? "Confirm business vs private expense" : undefined },
    ];

    // Weighted overall
    const totalWeight = signals.reduce((s, x) => s + x.weight, 0);
    const overall = Math.round(signals.reduce((s, x) => s + x.score * x.weight, 0) / (totalWeight || 1));
    const grade =
      overall >= 90 ? "A" :
      overall >= 80 ? "B" :
      overall >= 65 ? "C" :
      overall >= 50 ? "D" : "F";

    const details = {
      version: "v2",
      generated_at: new Date().toISOString(),
      entity_id: entityId,
      signals,
      totals: {
        documents: totalDocs,
        payments: totalPay,
        open_tasks: openTaskCount,
        subs_no_invoice: subsNoInv,
      },
      recommendations: signals
        .filter((s) => s.action && s.score < 90)
        .sort((a, b) => a.score - b.score)
        .slice(0, 8)
        .map((s) => ({ key: s.key, action: s.action!, current_score: s.score })),
    };

    if (persist) {
      await admin.from("finance_health_scores").insert({
        score_key: "finance_health_v2",
        score_name: "Finance Health (v2, weighted)",
        score_value: overall,
        score_grade: grade,
        reason: `Overall ${overall}/100 · ${signals.filter((s) => s.score < 80).length} area(s) below 80`,
        details,
      });
      await admin.from("finance_health_history").insert({
        snapshot_date: new Date().toISOString().slice(0, 10),
        overall_score: overall,
        scores: details,
      });
    }

    return new Response(JSON.stringify({ ok: true, overall, grade, details }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});