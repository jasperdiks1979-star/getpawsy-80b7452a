import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const now = new Date();
    const year = now.getUTCFullYear();
    const quarter = Math.floor(now.getUTCMonth() / 3) + 1;

    const [vatCurrent, matches, docs, payments, suppliers, subs] = await Promise.all([
      supa.from("finance_vat_classifications")
        .select("recoverable_minor,vat_minor,confidence").eq("fiscal_year", year).eq("quarter", quarter),
      supa.from("finance_reconciliation_matches").select("match_status,invoice_document_id,payment_id"),
      supa.from("evidence_documents").select("id,document_type,extraction_confidence").limit(20000),
      supa.from("evidence_payments").select("id").limit(20000),
      supa.from("evidence_suppliers").select("id,risk_score"),
      supa.from("finance_subscriptions").select("is_active,forecast_annual_minor"),
    ]);

    const recoverable = (vatCurrent.data ?? []).reduce((s, r) => s + Number(r.recoverable_minor || 0), 0);
    const acceptedInv = new Set((matches.data ?? []).filter(m => m.match_status === "accepted" && m.invoice_document_id).map(m => m.invoice_document_id));
    const acceptedPay = new Set((matches.data ?? []).filter(m => m.match_status === "accepted" && m.payment_id).map(m => m.payment_id));
    const invoices = (docs.data ?? []).filter(d => /invoice/i.test(d.document_type || ""));
    const missingInvoices = invoices.filter(d => !acceptedInv.has(d.id)).length;
    const unmatchedPayments = (payments.data ?? []).filter(p => !acceptedPay.has(p.id)).length;
    const totalDocs = (docs.data ?? []).length || 1;
    const withGoodConf = (docs.data ?? []).filter(d => Number(d.extraction_confidence ?? 0) >= 0.7).length;
    const evidenceCompleteness = Math.round((withGoodConf / totalDocs) * 100);
    const supplierConfidence = (suppliers.data ?? []).length
      ? Math.round(100 - ((suppliers.data ?? []).reduce((s, r) => s + Number(r.risk_score ?? 0), 0) / (suppliers.data ?? []).length))
      : 0;
    const subsAnnualized = (subs.data ?? []).filter(s => s.is_active).reduce((s, r) => s + Number(r.forecast_annual_minor || 0), 0);
    const taxReadinessPct = Math.max(0, Math.min(100, 100 - (missingInvoices + unmatchedPayments) * 3));

    return new Response(JSON.stringify({
      ok: true,
      recoverable_vat_minor: recoverable,
      tax_readiness_pct: taxReadinessPct,
      evidence_completeness_pct: evidenceCompleteness,
      unmatched_payments: unmatchedPayments,
      missing_invoices: missingInvoices,
      supplier_confidence_pct: Math.max(0, Math.min(100, supplierConfidence)),
      subscriptions_annualized_minor: subsAnnualized,
      estimated_next_vat_refund_minor: recoverable,
      period: { year, quarter },
      generated_at: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});