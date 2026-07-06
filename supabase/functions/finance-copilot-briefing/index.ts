// Finance Copilot Briefing (Phase 7 + 8) — deterministic morning-briefing synthesizer.
// Aggregates canonical outputs from finance_health_scores, finance_import_tasks,
// finance_alerts, finance_vat_summaries, evidence_payments, evidence_documents,
// finance_subscriptions, finance_connectors. Produces a single JSON briefing with
// prioritized action recommendations. Zero AI credits — pure aggregation, so it is
// safe to call repeatedly. Never fabricates figures: every number comes from a
// row-level count or the latest persisted score snapshot.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Action = {
  priority: "critical" | "high" | "medium" | "low";
  category: string;
  title: string;
  detail: string;
  source: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const entityId: string | null = body?.entity_id ?? null;
    const eq = (q: any) => (entityId ? q.eq("entity_id", entityId) : q);

    // ---- Pull canonical snapshots in parallel (reuse existing tables only)
    const [
      { data: latestHealth },
      { data: latestVat },
      openTasks,
      failedTasks,
      openAlerts,
      criticalAlerts,
      unmatchedPay,
      unknownSup,
      missingVat,
      lowConfDocs,
      activeSubs,
      connectors,
    ] = await Promise.all([
      admin
        .from("finance_health_scores")
        .select("score_value, score_grade, computed_at, details, reason")
        .eq("score_key", "finance_health_v2")
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("finance_vat_summaries")
        .select("period_type, period_year, period_number, vat_total_minor, recoverable_minor, outstanding_minor, reclaimed_minor, currency")
        .order("period_year", { ascending: false })
        .order("period_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
      eq(admin.from("finance_import_tasks").select("id", { count: "exact", head: true }).eq("status", "open")),
      eq(admin.from("finance_import_tasks").select("id", { count: "exact", head: true }).eq("status", "failed")),
      admin.from("finance_alerts").select("id", { count: "exact", head: true }).eq("is_resolved", false),
      admin.from("finance_alerts").select("id", { count: "exact", head: true }).eq("is_resolved", false).eq("severity", "critical"),
      eq(admin.from("evidence_payments").select("id", { count: "exact", head: true }).is("invoice_document_id", null)),
      eq(admin.from("evidence_documents").select("id", { count: "exact", head: true }).is("supplier_id", null)),
      eq(admin.from("evidence_documents").select("id", { count: "exact", head: true }).is("vat_minor", null).not("amount_minor", "is", null)),
      eq(admin.from("evidence_documents").select("id", { count: "exact", head: true }).lt("classification_confidence", 0.7)),
      admin.from("finance_subscriptions").select("id", { count: "exact", head: true }).eq("is_active", true),
      admin.from("finance_connectors").select("id", { count: "exact", head: true }),
    ]);

    const actions: Action[] = [];
    const push = (a: Action) => actions.push(a);

    const crit = criticalAlerts.count ?? 0;
    if (crit > 0) push({
      priority: "critical",
      category: "Alerts",
      title: `${crit} critical finance alert(s) open`,
      detail: "Resolve blocking alerts before any accountant export.",
      source: "finance_alerts",
    });

    const missVat = missingVat.count ?? 0;
    if (missVat > 0) push({
      priority: missVat > 20 ? "high" : "medium",
      category: "VAT",
      title: `${missVat} document(s) missing VAT amount`,
      detail: "Run Tax Readiness or classify VAT via the invoice-quality engine.",
      source: "evidence_documents.vat_minor",
    });

    const unmatched = unmatchedPay.count ?? 0;
    if (unmatched > 0) push({
      priority: unmatched > 10 ? "high" : "medium",
      category: "Reconciliation",
      title: `${unmatched} unmatched bank payment(s)`,
      detail: "Invoke finance-reconcile-payments or review manually in Reconciliation Center.",
      source: "evidence_payments.invoice_document_id",
    });

    const unkSup = unknownSup.count ?? 0;
    if (unkSup > 0) push({
      priority: "medium",
      category: "Suppliers",
      title: `${unkSup} document(s) without supplier`,
      detail: "Run finance-evidence-discover; auto-assign only ≥95% confidence, else manual review.",
      source: "evidence_documents.supplier_id",
    });

    const openT = openTasks.count ?? 0;
    if (openT > 0) push({
      priority: openT > 5 ? "high" : "medium",
      category: "Import Queue",
      title: `${openT} open import task(s)`,
      detail: "Upload the missing invoices from Open Finance Tasks.",
      source: "finance_import_tasks",
    });

    const failT = failedTasks.count ?? 0;
    if (failT > 0) push({
      priority: "high",
      category: "Import Queue",
      title: `${failT} failed import task(s)`,
      detail: "Retry failed tasks or inspect logs in Import Queue Monitor.",
      source: "finance_import_tasks.status=failed",
    });

    const lowConf = lowConfDocs.count ?? 0;
    if (lowConf > 0) push({
      priority: "low",
      category: "OCR / Classification",
      title: `${lowConf} document(s) at <70% confidence`,
      detail: "Re-run forensic-extract or confirm supplier assignment manually.",
      source: "evidence_documents.classification_confidence",
    });

    // Sort by priority
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    actions.sort((a, b) => rank[a.priority] - rank[b.priority]);

    const briefing = {
      generated_at: new Date().toISOString(),
      entity_id: entityId,
      health: latestHealth
        ? {
            score: latestHealth.score_value,
            grade: latestHealth.score_grade,
            computed_at: latestHealth.computed_at,
            reason: latestHealth.reason,
            top_weak_signals: (latestHealth.details?.signals ?? [])
              .filter((s: any) => s.score < 80)
              .sort((a: any, b: any) => a.score - b.score)
              .slice(0, 5)
              .map((s: any) => ({ key: s.key, label: s.label, score: s.score, reason: s.reason, action: s.action })),
          }
        : null,
      vat: latestVat ?? null,
      totals: {
        open_tasks: openT,
        failed_tasks: failT,
        open_alerts: openAlerts.count ?? 0,
        critical_alerts: crit,
        unmatched_payments: unmatched,
        unknown_supplier_docs: unkSup,
        docs_missing_vat: missVat,
        docs_low_confidence: lowConf,
        active_subscriptions: activeSubs.count ?? 0,
        connectors_registered: connectors.count ?? 0,
      },
      recommended_actions: actions,
      readiness: {
        can_export_accountant: crit === 0 && missVat === 0,
        can_reclaim_vat: (latestVat?.recoverable_minor ?? 0) > 0 && crit === 0,
        blockers: [
          crit > 0 ? "Critical alerts open" : null,
          missVat > 0 ? "Documents missing VAT" : null,
          failT > 0 ? "Failed imports in queue" : null,
        ].filter(Boolean),
      },
    };

    return new Response(JSON.stringify({ ok: true, briefing }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[finance-copilot-briefing]", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});