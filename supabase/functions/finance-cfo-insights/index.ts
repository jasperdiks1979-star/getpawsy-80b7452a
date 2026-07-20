import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const monthKey = (d: string) => d.slice(0, 7);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  try {
    const since = new Date(Date.now() - 180 * 86400_000).toISOString();
    const [payments, orders, subs, docs, matches] = await Promise.all([
      supa.from("evidence_payments").select("paid_at,amount_minor,supplier_id").gte("paid_at", since).limit(10000),
      supa.from("orders").select("created_at,total_amount,status").gte("created_at", since).limit(10000),
      supa.from("finance_subscriptions").select("supplier_slug,product_name,is_active,forecast_annual_minor,renewal_risk,price_trend"),
      supa.from("evidence_documents").select("id,extraction_confidence,bookkeeping_readiness,document_type,invoice_date").gte("invoice_date", since.slice(0, 10)),
      supa.from("finance_reconciliation_matches").select("match_status,invoice_document_id,payment_id"),
    ]);

    const months = new Map<string, { revenue: number; expense: number }>();
    for (const o of orders.data ?? []) {
      if (!/paid|complete|success|fulfilled/i.test(o.status || "")) continue;
      const k = monthKey(o.created_at);
      const r = months.get(k) ?? { revenue: 0, expense: 0 };
      r.revenue += Number(o.total_amount || 0);
      months.set(k, r);
    }
    for (const p of payments.data ?? []) {
      if (!p.paid_at) continue;
      const k = monthKey(p.paid_at);
      const r = months.get(k) ?? { revenue: 0, expense: 0 };
      r.expense += Number(p.amount_minor || 0) / 100;
      months.set(k, r);
    }
    const monthRows = Array.from(months.entries())
      .map(([m, v]) => ({ month: m, revenue: v.revenue, expense: v.expense, profit: v.revenue - v.expense }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6);
    const last3 = monthRows.slice(-3);
    const cashBurn = last3.length
      ? last3.reduce((s, m) => s + Math.max(0, m.expense - m.revenue), 0) / last3.length
      : 0;

    // Largest suppliers
    const bySupplier = new Map<string, number>();
    for (const p of payments.data ?? []) {
      if (!p.supplier_id) continue;
      bySupplier.set(p.supplier_id, (bySupplier.get(p.supplier_id) ?? 0) + Number(p.amount_minor || 0));
    }
    const supplierIds = Array.from(bySupplier.keys());
    const supplierNames = new Map<string, string>();
    if (supplierIds.length) {
      const { data: srows } = await supa.from("evidence_suppliers").select("id,legal_name").in("id", supplierIds);
      for (const s of srows ?? []) supplierNames.set(s.id, s.legal_name || "Unknown");
    }
    const largest = Array.from(bySupplier.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, m]) => ({ supplier_id: id, name: supplierNames.get(id) ?? "Unknown", spend_minor: m }));

    // Fastest growing costs: compare last month vs previous 3-month avg per supplier
    const growing: Array<{ name: string; delta_pct: number; last_minor: number }> = [];
    if (monthRows.length >= 2) {
      const lastMonth = monthRows[monthRows.length - 1].month;
      const perSupLastMonth = new Map<string, number>();
      const perSupPrev = new Map<string, number[]>();
      for (const p of payments.data ?? []) {
        if (!p.paid_at || !p.supplier_id) continue;
        const k = monthKey(p.paid_at);
        const bucket = k === lastMonth ? perSupLastMonth : null;
        if (bucket) bucket.set(p.supplier_id, (bucket.get(p.supplier_id) ?? 0) + Number(p.amount_minor || 0));
        else {
          const arr = perSupPrev.get(p.supplier_id) ?? [];
          arr.push(Number(p.amount_minor || 0));
          perSupPrev.set(p.supplier_id, arr);
        }
      }
      for (const [sid, last] of perSupLastMonth) {
        const prev = perSupPrev.get(sid) ?? [];
        const avg = prev.length ? prev.reduce((s, v) => s + v, 0) / Math.max(1, monthRows.length - 1) : 0;
        if (avg <= 0) continue;
        const delta = ((last - avg) / avg) * 100;
        if (delta > 20) growing.push({ name: supplierNames.get(sid) ?? sid, delta_pct: Math.round(delta), last_minor: last });
      }
      growing.sort((a, b) => b.delta_pct - a.delta_pct);
    }

    // Subscription risks
    const subRisks = (subs.data ?? []).filter(s => s.is_active && (s.renewal_risk === "high" || s.price_trend === "up"))
      .slice(0, 8).map(s => ({
        supplier: s.supplier_slug, product: s.product_name,
        annualized_minor: s.forecast_annual_minor, risk: s.renewal_risk, trend: s.price_trend,
      }));
    const subsAnnualized = (subs.data ?? []).filter(s => s.is_active).reduce((s, r) => s + Number(r.forecast_annual_minor || 0), 0);

    // Missing evidence
    const acceptedInv = new Set((matches.data ?? []).filter(m => m.match_status === "accepted" && m.invoice_document_id).map(m => m.invoice_document_id));
    const missingEvidence = (docs.data ?? []).filter(d => !acceptedInv.has(d.id) && /invoice/i.test(d.document_type || "")).length;
    const lowConfDocs = (docs.data ?? []).filter(d => Number(d.extraction_confidence ?? 0) < 0.7).length;

    const recommendations: string[] = [];
    if (cashBurn > 0) recommendations.push(`Reduce burn by €${cashBurn.toFixed(0)}/mo — review top 5 suppliers below`);
    if (growing[0]) recommendations.push(`Costs up ${growing[0].delta_pct}% at ${growing[0].name} — investigate`);
    if (subRisks.length) recommendations.push(`${subRisks.length} subscription(s) at renewal risk — audit before renewal`);
    if (missingEvidence > 0) recommendations.push(`Attach evidence to ${missingEvidence} invoice(s) to unlock VAT recovery`);
    if (lowConfDocs > 0) recommendations.push(`${lowConfDocs} document(s) below 70% extraction confidence — review manually`);

    return new Response(JSON.stringify({
      ok: true,
      months: monthRows,
      cash_burn_monthly: Math.round(cashBurn * 100),
      largest_suppliers: largest,
      fastest_growing_costs: growing.slice(0, 5),
      subscription_risks: subRisks,
      subscriptions_annualized_minor: subsAnnualized,
      missing_evidence_count: missingEvidence,
      low_confidence_document_count: lowConfDocs,
      vat_risk_document_count: lowConfDocs,
      recommendations,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});