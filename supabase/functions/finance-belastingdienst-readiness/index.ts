import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function quarterOf(d: Date) {
  return Math.floor(d.getUTCMonth() / 3) + 1;
}
function quarterRange(year: number, q: number) {
  const start = new Date(Date.UTC(year, (q - 1) * 3, 1));
  const end = new Date(Date.UTC(year, q * 3, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({} as any));
    const now = new Date();
    const year: number = Number(body.year) || now.getUTCFullYear();
    const quarter: number = Number(body.quarter) || quarterOf(now);
    const entity_id: string | null = body.entity_id || null;
    const { start, end } = quarterRange(year, quarter);

    let vatQ = supa.from("finance_vat_classifications")
      .select("bucket,vat_minor,recoverable_minor,non_deductible_minor,reverse_charge,import_vat,confidence,document_id,fiscal_year,quarter")
      .eq("fiscal_year", year).eq("quarter", quarter);
    if (entity_id) vatQ = vatQ.eq("entity_id", entity_id);
    const { data: vat } = await vatQ;

    let docsQ = supa.from("evidence_documents")
      .select("id,document_type,invoice_date,extraction_confidence,bookkeeping_readiness,validation_state,total_minor,vat_minor,supplier_id")
      .gte("invoice_date", start).lt("invoice_date", end);
    if (entity_id) docsQ = docsQ.eq("entity_id", entity_id);
    const { data: docs } = await docsQ;

    const { data: payments } = await supa.from("evidence_payments")
      .select("id,paid_at,amount_minor")
      .gte("paid_at", start).lt("paid_at", end);
    const { data: matches } = await supa.from("finance_reconciliation_matches")
      .select("id,invoice_document_id,payment_id,match_status");

    const acceptedInv = new Set((matches ?? []).filter(m => m.match_status === "accepted" && m.invoice_document_id).map(m => m.invoice_document_id));
    const acceptedPay = new Set((matches ?? []).filter(m => m.match_status === "accepted" && m.payment_id).map(m => m.payment_id));

    const invoices = (docs ?? []).filter(d => (d.document_type ?? "").toLowerCase().includes("invoice"));
    const receipts = (docs ?? []).filter(d => (d.document_type ?? "").toLowerCase().includes("receipt"));
    const lowConfidence = (docs ?? []).filter(d => Number(d.extraction_confidence ?? 0) < 0.7).length;
    const missingInvoices = invoices.filter(d => !acceptedInv.has(d.id)).length;
    const missingReceipts = receipts.filter(d => !acceptedInv.has(d.id)).length;
    const unmatchedPayments = (payments ?? []).filter(p => !acceptedPay.has(p.id)).length;

    const sum = (arr: any[], k: string) => arr.reduce((s, r) => s + Number(r[k] || 0), 0);
    const recoverable = sum(vat ?? [], "recoverable_minor");
    const nonDeductible = sum(vat ?? [], "non_deductible_minor");
    const reverseCharge = (vat ?? []).filter(v => v.reverse_charge).reduce((s, v) => s + Number(v.vat_minor || 0), 0);
    const importVat = (vat ?? []).filter(v => v.import_vat).reduce((s, v) => s + Number(v.vat_minor || 0), 0);
    const potential = sum(vat ?? [], "vat_minor");

    // status
    const evidenceIssues = missingInvoices + missingReceipts + unmatchedPayments + lowConfidence;
    const readiness_pct = Math.max(0, Math.min(100, 100 - evidenceIssues * 4));
    const status = readiness_pct >= 85 ? "ready" : readiness_pct >= 65 ? "review" : "unsafe";

    return new Response(JSON.stringify({
      ok: true,
      period: { year, quarter, start, end },
      totals: {
        recoverable_minor: recoverable,
        reverse_charge_minor: reverseCharge,
        import_vat_minor: importVat,
        non_deductible_minor: nonDeductible,
        potential_minor: potential,
      },
      counts: {
        invoices: invoices.length,
        receipts: receipts.length,
        payments: (payments ?? []).length,
        missing_invoices: missingInvoices,
        missing_receipts: missingReceipts,
        unmatched_payments: unmatchedPayments,
        low_confidence_documents: lowConfidence,
        vat_classifications: (vat ?? []).length,
      },
      readiness_pct,
      status,
      disclaimer: "This report prepares Belastingdienst bookkeeping. It never files tax returns automatically.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});