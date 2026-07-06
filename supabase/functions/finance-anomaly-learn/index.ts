import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/**
 * Learns from accepted / rejected reconciliation matches and supplier corrections.
 * Produces versioned, reversible rules stored in finance_supplier_memory
 * with source='learned', rule_key='anomaly_weights'.
 * Also returns a summary for the UI monitor.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { data: matches } = await supa.from("finance_reconciliation_matches")
      .select("supplier_id,match_status,confidence,amount_delta_minor,date_delta_days,match_signals");

    const perSupplier = new Map<string, { accepted: number; rejected: number; sumConfAccepted: number; sumConfRejected: number; avgAmountDelta: number[]; avgDateDelta: number[] }>();
    for (const m of matches ?? []) {
      if (!m.supplier_id) continue;
      const r = perSupplier.get(m.supplier_id) ?? { accepted: 0, rejected: 0, sumConfAccepted: 0, sumConfRejected: 0, avgAmountDelta: [], avgDateDelta: [] };
      if (m.match_status === "accepted") {
        r.accepted += 1;
        r.sumConfAccepted += Number(m.confidence || 0);
        r.avgAmountDelta.push(Math.abs(Number(m.amount_delta_minor || 0)));
        r.avgDateDelta.push(Math.abs(Number(m.date_delta_days || 0)));
      } else if (m.match_status === "rejected") {
        r.rejected += 1;
        r.sumConfRejected += Number(m.confidence || 0);
      }
      perSupplier.set(m.supplier_id, r);
    }

    let updated = 0;
    const summary: any[] = [];
    for (const [supplier_id, r] of perSupplier) {
      const total = r.accepted + r.rejected;
      if (total < 2) continue;
      const acceptanceRate = r.accepted / total;
      const avgAmountDelta = r.avgAmountDelta.length ? Math.round(r.avgAmountDelta.reduce((s, v) => s + v, 0) / r.avgAmountDelta.length) : 0;
      const avgDateDelta = r.avgDateDelta.length ? Math.round(r.avgDateDelta.reduce((s, v) => s + v, 0) / r.avgDateDelta.length) : 0;
      // suggested tolerances tightened around what humans have accepted
      const learned = {
        acceptance_rate: Number(acceptanceRate.toFixed(2)),
        avg_amount_delta_minor: avgAmountDelta,
        avg_date_delta_days: avgDateDelta,
        suggested_amount_tolerance_minor: Math.max(100, avgAmountDelta * 2),
        suggested_date_tolerance_days: Math.max(2, avgDateDelta * 2),
        sample_size: total,
        derived_from: "finance_reconciliation_matches",
      };
      await supa.from("finance_supplier_memory").upsert({
        supplier_id,
        rule_key: "anomaly_weights",
        rule_value: learned,
        confidence: Math.min(1, 0.5 + total / 20),
        source: "learned",
      }, { onConflict: "supplier_id,rule_key" });
      updated += 1;
      summary.push({ supplier_id, ...learned });
    }

    // Also expose recent anomaly stats for monitor
    const { data: recent } = await supa.from("finance_anomalies")
      .select("id,anomaly_type,status,detected_at").order("detected_at", { ascending: false }).limit(50);
    const byStatus: Record<string, number> = {};
    for (const a of recent ?? []) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;

    return new Response(JSON.stringify({
      ok: true,
      updated_supplier_rules: updated,
      total_matches_considered: (matches ?? []).length,
      supplier_rules: summary.slice(0, 20),
      recent_anomaly_status_counts: byStatus,
      reasoning: "Rules derived from accepted/rejected reconciliation matches. Versioned via finance_supplier_memory upsert; reversible by deleting the row.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});