// Tax Readiness — aggregates VAT & evidence signals for the CURRENT quarter (or a
// requested period). Reuses evidence_documents, evidence_payments,
// finance_import_tasks, finance_vat_summaries. Never triggers a filing.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function currentQuarter(d = new Date()) {
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(y, startMonth, 1));
  const end = new Date(Date.UTC(y, startMonth + 3, 0, 23, 59, 59));
  return { year: y, quarter: q, start, end };
}

const light = (pct: number) => (pct >= 90 ? "green" : pct >= 70 ? "amber" : "red");

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
    const period = currentQuarter(body.at ? new Date(body.at) : undefined);

    const eq = (q: any) => (entityId ? q.eq("entity_id", entityId) : q);
    const inRange = (q: any, col: string) =>
      q.gte(col, period.start.toISOString().slice(0, 10)).lte(col, period.end.toISOString().slice(0, 10));

    const [docs, pays, tasks, prevSummary] = await Promise.all([
      eq(inRange(admin.from("evidence_documents").select(
        "id,amount_minor,currency,vat_minor,tax_country,document_type,supplier_id,classification_confidence,metadata,document_date"
      ), "document_date")),
      eq(inRange(admin.from("evidence_payments").select(
        "id,amount_minor,currency,vat_minor,invoice_document_id,paid_at"
      ), "paid_at")),
      eq(admin.from("finance_import_tasks").select("id,status")
        .in("status", ["open", "failed"])),
      admin.from("finance_vat_summaries")
        .select("recoverable_minor,outstanding_minor,currency")
        .eq("period_year", period.year).eq("period_number", period.quarter).maybeSingle(),
    ]);

    const D = docs.data ?? [];
    const P = pays.data ?? [];
    const T = tasks.data ?? [];

    const invoices = D.filter((d: any) => d.document_type !== "receipt");
    const receipts = D.filter((d: any) => d.document_type === "receipt");

    const matchedInvoiceIds = new Set(
      P.map((p: any) => p.invoice_document_id).filter(Boolean)
    );
    const invoicesImported = invoices.length;
    const invoicesMatched = invoices.filter((d: any) => matchedInvoiceIds.has(d.id)).length;

    const txImported = P.length;
    const txMatched = P.filter((p: any) => p.invoice_document_id).length;

    // VAT buckets (best-effort from metadata; falls back to vat_minor sign & tax_country)
    let recoverable = 0, reverseCharge = 0, importVat = 0, nonDeductible = 0, potential = 0, missingVat = 0;
    for (const d of D as any[]) {
      const md = (d.metadata ?? {}) as Record<string, any>;
      const bucket = String(md.vat_bucket ?? "").toLowerCase();
      const vat = Number(d.vat_minor ?? 0);
      if (d.vat_minor == null && d.amount_minor != null) { missingVat += 1; continue; }
      if (bucket === "reverse_charge" || md.reverse_charge === true) reverseCharge += vat;
      else if (bucket === "import_vat" || md.import_vat === true) importVat += vat;
      else if (bucket === "non_deductible" || md.non_deductible === true) nonDeductible += vat;
      else if (bucket === "potential") potential += vat;
      else recoverable += vat;
    }

    const missingInvoices = T.filter((t: any) => t.status === "open").length;
    const missingReceipts = P.filter((p: any) => !p.invoice_document_id).length;

    const invMatchPct = invoicesImported ? (invoicesMatched / invoicesImported) * 100 : 100;
    const txMatchPct = txImported ? (txMatched / txImported) * 100 : 100;
    const vatCompletenessPct = D.length ? ((D.length - missingVat) / D.length) * 100 : 100;
    const confidenceScore = D.length
      ? Math.round((D.reduce((s: number, d: any) => s + Number(d.classification_confidence ?? 0), 0) / D.length) * 100)
      : 0;

    const readinessPct = Math.round((invMatchPct * 0.3 + txMatchPct * 0.3 + vatCompletenessPct * 0.3 + confidenceScore * 0.1));

    const traffic = {
      invoices_matched: light(invMatchPct),
      transactions_matched: light(txMatchPct),
      vat_completeness: light(vatCompletenessPct),
      evidence_confidence: light(confidenceScore),
      overall_readiness: light(readinessPct),
    };

    return new Response(
      JSON.stringify({
        ok: true,
        period: { year: period.year, quarter: period.quarter, start: period.start, end: period.end },
        invoices_imported: invoicesImported,
        invoices_matched: invoicesMatched,
        receipts_imported: receipts.length,
        transactions_imported: txImported,
        transactions_matched: txMatched,
        vat: {
          recoverable_minor: recoverable,
          reverse_charge_minor: reverseCharge,
          import_vat_minor: importVat,
          non_deductible_minor: nonDeductible,
          potential_minor: potential,
          missing_vat_docs: missingVat,
        },
        missing_invoices: missingInvoices,
        missing_receipts: missingReceipts,
        confidence_score: confidenceScore,
        readiness_pct: readinessPct,
        traffic_lights: traffic,
        prior_summary: prevSummary.data ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});