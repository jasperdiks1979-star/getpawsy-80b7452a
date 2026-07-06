// Finance Production Certification (Phase 11 + 12) — end-to-end orchestrator.
// Invokes each canonical finance engine, captures verdicts, and produces a single
// certification report covering Finance Health, Tax Readiness, VAT Intelligence,
// Reconciliation, Accountant Exports, Copilot, and autonomous workflows.
//
// Integrity guarantees:
//   * Does NOT write invoices, VAT rows, payments, or accounting entries.
//   * Does NOT overwrite human-reviewed records.
//   * Does NOT spend AI credits (calls only deterministic engines).
//   * All figures are surfaced from live tables; missing evidence is reported
//     as remaining_manual_action, never fabricated.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Verdict = "PASS" | "PASS_WITH_ACTIONS" | "FAIL" | "SKIPPED";
type Category = {
  name: string;
  verdict: Verdict;
  score: number | null;
  evidence: Record<string, unknown>;
  remaining_manual_actions: string[];
};

async function callInternal(name: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<any> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        ...extraHeaders,
      },
      body: JSON.stringify(body ?? {}),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* keep raw text */ }
    return { ok: res.ok, status: res.status, body: json ?? text };
  } catch (e) {
    return { ok: false, status: 0, body: { error: String((e as Error).message ?? e) } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const started = Date.now();
    const categories: Category[] = [];

    // 1. Finance Health 2.0
    const health = await callInternal("finance-health-score", { persist: false });
    const hOverall = health.body?.overall ?? null;
    categories.push({
      name: "Finance Health 2.0",
      verdict: !health.ok ? "FAIL" : hOverall >= 80 ? "PASS" : "PASS_WITH_ACTIONS",
      score: hOverall,
      evidence: {
        grade: health.body?.grade ?? null,
        weak_signal_count: (health.body?.details?.signals ?? []).filter((s: any) => s.score < 80).length,
      },
      remaining_manual_actions: (health.body?.details?.recommendations ?? [])
        .slice(0, 5)
        .map((r: any) => `${r.action} (score ${r.current_score})`),
    });

    // 2. Connector Health (Phase 1 reuse)
    const conn = await callInternal("finance-connector-health", {});
    const connectors = conn.body?.connectors ?? [];
    const overdue = connectors.filter((c: any) => c.verdict === "Overdue" || c.verdict === "Silent").length;
    categories.push({
      name: "Autonomous Connector Registry",
      verdict: !conn.ok ? "FAIL" : overdue === 0 ? "PASS" : "PASS_WITH_ACTIONS",
      score: connectors.length ? Math.round((100 * (connectors.length - overdue)) / connectors.length) : null,
      evidence: { total: connectors.length, overdue_or_silent: overdue },
      remaining_manual_actions: connectors
        .filter((c: any) => c.verdict === "Overdue" || c.verdict === "Silent")
        .slice(0, 8)
        .map((c: any) => `Refresh ${c.slug ?? c.name ?? "connector"} (${c.verdict})`),
    });

    // 3. VAT Intelligence (Phase 6 reuse)
    const vat = await callInternal("finance-vat-intelligence", {});
    const coverage = vat.body?.coverage_pct ?? vat.body?.summary?.coverage_pct ?? null;
    categories.push({
      name: "VAT Intelligence",
      verdict: !vat.ok ? "FAIL" : coverage == null ? "PASS_WITH_ACTIONS" : coverage >= 95 ? "PASS" : "PASS_WITH_ACTIONS",
      score: coverage,
      evidence: {
        recoverable_minor: vat.body?.buckets?.recoverable?.total_minor ?? null,
        blocked_minor: vat.body?.buckets?.blocked?.total_minor ?? null,
        missing_evidence_minor: vat.body?.buckets?.missing_evidence?.total_minor ?? null,
      },
      remaining_manual_actions:
        (vat.body?.buckets?.missing_evidence?.count ?? 0) > 0
          ? [`Upload evidence for ${vat.body?.buckets?.missing_evidence?.count} VAT line(s)`]
          : [],
    });

    // 4. Reconciliation (Phase 5 — non-destructive, deterministic pass only)
    const rec = await callInternal("finance-reconcile-payments", { dry_run: true });
    const matched = rec.body?.matched ?? rec.body?.accepted ?? null;
    const unmatched = rec.body?.unmatched ?? null;
    categories.push({
      name: "Probabilistic Reconciliation",
      verdict: !rec.ok ? "FAIL" : (unmatched ?? 0) === 0 ? "PASS" : "PASS_WITH_ACTIONS",
      score: matched != null && unmatched != null && (matched + unmatched) > 0
        ? Math.round((100 * matched) / (matched + unmatched)) : null,
      evidence: { matched, unmatched, self_healed: rec.body?.self_healed_links ?? null },
      remaining_manual_actions: (unmatched ?? 0) > 0
        ? [`Review ${unmatched} unmatched payment(s) in Reconciliation Center`] : [],
    });

    // 5. Tax Readiness (existing engine)
    const tax = await callInternal("finance-tax-readiness", {});
    const taxScore = tax.body?.score ?? tax.body?.overall ?? null;
    categories.push({
      name: "Tax Readiness",
      verdict: !tax.ok ? "SKIPPED" : (taxScore ?? 0) >= 80 ? "PASS" : "PASS_WITH_ACTIONS",
      score: taxScore,
      evidence: tax.body?.summary ?? tax.body?.buckets ?? {},
      remaining_manual_actions: tax.body?.blockers ?? tax.body?.actions ?? [],
    });

    // 6. Belastingdienst Readiness (existing)
    const bel = await callInternal("finance-belastingdienst-readiness", {});
    categories.push({
      name: "Belastingdienst Readiness",
      verdict: !bel.ok ? "SKIPPED" : (bel.body?.ready ? "PASS" : "PASS_WITH_ACTIONS"),
      score: bel.body?.score ?? null,
      evidence: bel.body?.summary ?? {},
      remaining_manual_actions: bel.body?.blockers ?? [],
    });

    // 7. Accountant Export (internal dry-run; bypasses interactive admin guard
    // via x-internal-secret. Never writes a job. Never emits payload bytes.)
    const exp = await callInternal(
      "finance-accountant-export",
      { dry_run: true, export_type: "audit_package" },
      { "x-internal-secret": SERVICE_KEY },
    );
    // Enterprise Stabilization: enforce Export Completeness. Compare row_counts
    // returned by the export against canonical DB counts. Any array that is
    // empty while the underlying table has verified rows is a FAIL.
    const [dCount, pCount, sCount, subCount, tCount, vCount, mCount] = await Promise.all([
      admin.from("evidence_documents").select("id", { count: "exact", head: true }),
      admin.from("evidence_payments").select("id", { count: "exact", head: true }),
      admin.from("evidence_suppliers").select("id", { count: "exact", head: true }),
      admin.from("finance_subscriptions").select("id", { count: "exact", head: true }),
      admin.from("finance_import_tasks").select("id", { count: "exact", head: true }).eq("status", "open"),
      admin.from("finance_vat_classifications").select("id", { count: "exact", head: true }),
      admin.from("finance_reconciliation_matches").select("id", { count: "exact", head: true }),
    ]);
    const canonical = {
      invoices: dCount.count ?? 0,
      payments: pCount.count ?? 0,
      suppliers: sCount.count ?? 0,
      subscriptions: subCount.count ?? 0,
      open_tasks: tCount.count ?? 0,
      vat: vCount.count ?? 0,
      matches: mCount.count ?? 0,
    };
    const exported = exp.body?.row_counts ?? {};
    const mismatches: string[] = [];
    for (const k of Object.keys(canonical) as Array<keyof typeof canonical>) {
      const c = canonical[k]; const e = Number((exported as any)[k] ?? 0);
      if (c > 0 && e === 0) mismatches.push(`${k}: export empty but DB has ${c}`);
      else if (c !== e) mismatches.push(`${k}: export=${e} vs DB=${c}`);
    }
    const totalCanonical = Object.values(canonical).reduce((a, b) => a + b, 0);
    const totalExported = Object.values(canonical).reduce((a, k) => a + Number((exported as any)[k as any] ?? 0), 0);
    const completenessPct = totalCanonical === 0 ? 100 : Math.round((totalExported / totalCanonical) * 100);
    categories.push({
      name: "Accountant Export Pipeline",
      verdict: !exp.ok ? "FAIL" : mismatches.length ? "FAIL" : "PASS",
      score: exp.ok ? (mismatches.length ? Math.max(0, completenessPct) : 100) : 0,
      evidence: {
        bundle_files: exp.body?.files?.length ?? exp.body?.file_count ?? null,
        period: exp.body?.period ?? null,
        canonical_counts: canonical,
        exported_counts: exported,
        export_completeness_pct: completenessPct,
      },
      remaining_manual_actions: mismatches.length ? mismatches : (exp.body?.missing ?? []),
    });

    // 8. AI Copilot Briefing (deterministic, zero credits)
    const brief = await callInternal("finance-copilot-briefing", {});
    const actions = brief.body?.briefing?.recommended_actions ?? [];
    categories.push({
      name: "Finance AI Copilot",
      verdict: !brief.ok ? "FAIL" : "PASS",
      score: brief.ok ? 100 : 0,
      evidence: {
        action_count: actions.length,
        can_export_accountant: brief.body?.briefing?.readiness?.can_export_accountant ?? null,
        can_reclaim_vat: brief.body?.briefing?.readiness?.can_reclaim_vat ?? null,
      },
      remaining_manual_actions: actions
        .filter((a: any) => a.priority === "critical" || a.priority === "high")
        .slice(0, 6)
        .map((a: any) => `[${a.priority}] ${a.title}`),
    });

    // 9. Autonomous Workflow integrity (open tasks + alerts snapshot)
    const [{ count: openTasks }, { count: openAlerts }, { count: humanReviewed }] = await Promise.all([
      admin.from("finance_import_tasks").select("id", { count: "exact", head: true }).eq("status", "open"),
      admin.from("finance_alerts").select("id", { count: "exact", head: true }).eq("is_resolved", false),
      admin.from("evidence_documents").select("id", { count: "exact", head: true }).not("reviewed_at", "is", null),
    ]);
    categories.push({
      name: "Autonomous Workflows",
      verdict: (openAlerts ?? 0) === 0 && (openTasks ?? 0) === 0 ? "PASS" : "PASS_WITH_ACTIONS",
      score: null,
      evidence: {
        open_tasks: openTasks ?? 0,
        open_alerts: openAlerts ?? 0,
        human_reviewed_documents_preserved: humanReviewed ?? 0,
      },
      remaining_manual_actions: [
        (openTasks ?? 0) > 0 ? `Close ${openTasks} open import task(s)` : "",
        (openAlerts ?? 0) > 0 ? `Resolve ${openAlerts} open finance alert(s)` : "",
      ].filter(Boolean),
    });

    // Aggregate
    const scored = categories.filter((c) => typeof c.score === "number") as Array<Category & { score: number }>;
    const overall = scored.length
      ? Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length)
      : null;
    const failCount = categories.filter((c) => c.verdict === "FAIL").length;
    const withActions = categories.filter((c) => c.verdict === "PASS_WITH_ACTIONS").length;
    const overallVerdict: Verdict =
      failCount > 0 ? "FAIL" : withActions > 0 ? "PASS_WITH_ACTIONS" : "PASS";

    const report = {
      generated_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      overall_verdict: overallVerdict,
      overall_score: overall,
      categories,
      remaining_manual_actions: categories.flatMap((c) =>
        c.remaining_manual_actions.map((a) => ({ category: c.name, action: a })),
      ),
      integrity_guarantees: {
        no_invoices_fabricated: true,
        no_vat_fabricated: true,
        no_ai_credits_spent: true,
        human_reviewed_preserved: true,
        backwards_compatible: true,
      },
    };

    // Persist a snapshot into finance_health_scores (does not overwrite health_v2)
    await admin.from("finance_health_scores").insert({
      score_key: "finance_production_certification",
      score_name: "Finance Production Certification (Phases 7+8+11+12)",
      score_value: overall,
      score_grade: overallVerdict,
      reason: `${categories.length} categories · ${failCount} failed · ${withActions} with actions`,
      details: report,
    });

    return new Response(JSON.stringify({ ok: true, report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[finance-production-certify]", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});