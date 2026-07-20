// Wave D1 — 15-check forensic invoice quality score.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function evaluate(doc: any, vatClass: any | null, dupCount: number, paymentLinked: boolean) {
  const checks: Record<string, boolean> = {
    readable: (doc.ocr_status === "success" || (doc.ocr_text ?? "").length > 40),
    supplier_recognised: !!doc.supplier_id,
    invoice_number: !!doc.invoice_number,
    vat_number: !!doc.vat_number,
    invoice_date: !!doc.invoice_date,
    correct_totals: (doc.subtotal_minor != null && doc.vat_minor != null && doc.total_minor != null)
      ? Math.abs((Number(doc.subtotal_minor) + Number(doc.vat_minor)) - Number(doc.total_minor)) <= 2 : false,
    vat_consistency: (doc.vat_pct != null && doc.vat_minor != null && doc.subtotal_minor != null)
      ? Math.abs(Number(doc.vat_minor) - Math.round(Number(doc.subtotal_minor) * Number(doc.vat_pct) / 100)) <= 5 : (doc.vat_minor === 0),
    no_duplicate: dupCount <= 1,
    currency_valid: !!doc.currency,
    payment_linked: paymentLinked,
    supplier_confidence: (doc.classification_confidence ?? 0) >= 0.8 || !!doc.supplier_id,
    tax_classified: !!vatClass && vatClass.confidence >= 0.7,
    bookkeeping_classified: !!doc.bookkeeping_category,
    entity_assigned: !!doc.entity_id,
    ocr_quality: (doc.ocr_confidence ?? 0.8) >= 0.6 || (doc.ocr_text ?? "").length > 200,
  };
  const total = Object.keys(checks).length;
  const passed = Object.values(checks).filter(Boolean).length;
  const score = Math.round((passed / total) * 100);

  const reasons: string[] = [];
  const recommendations: string[] = [];
  for (const [k, v] of Object.entries(checks)) {
    if (!v) {
      reasons.push(`Failed check: ${k}`);
      recommendations.push(({
        readable: "Re-run OCR or upload a higher-resolution scan.",
        supplier_recognised: "Link the document to a supplier record.",
        invoice_number: "Add or extract the supplier invoice number.",
        vat_number: "Enter the supplier VAT (BTW) number.",
        invoice_date: "Set the invoice date.",
        correct_totals: "Verify subtotal + VAT equals total.",
        vat_consistency: "Check VAT rate vs computed amount.",
        no_duplicate: "Investigate potential duplicate uploads.",
        currency_valid: "Set the invoice currency.",
        payment_linked: "Match this invoice to a bank/Stripe payment.",
        supplier_confidence: "Confirm supplier identification.",
        tax_classified: "Run VAT classifier or set VAT bucket manually.",
        bookkeeping_classified: "Assign a bookkeeping / expense category.",
        entity_assigned: "Assign the legal entity (Skidzo / GetPawsy).",
        ocr_quality: "Improve OCR — rescan or use a clearer source file.",
      } as Record<string,string>)[k] ?? `Improve ${k}`);
    }
  }
  return { score, checks, reasons, recommendations };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  try {
    const { document_id, document_ids } = await req.json().catch(() => ({}));
    const ids: string[] = document_id ? [document_id] : Array.isArray(document_ids) ? document_ids : [];
    if (ids.length === 0) return json({ error: "document_id or document_ids required" }, 400);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: docs, error } = await sb.from("evidence_documents").select("*").in("id", ids);
    if (error) return json({ error: error.message }, 500);

    const results: any[] = [];
    for (const d of docs ?? []) {
      const [{ data: vatClass }, { count: dupCount }, { count: payCount }] = await Promise.all([
        sb.from("finance_vat_classifications").select("*").eq("document_id", d.id).maybeSingle(),
        sb.from("evidence_documents").select("*", { count: "exact", head: true }).eq("sha256", d.sha256),
        sb.from("evidence_payments").select("*", { count: "exact", head: true }).or(`invoice_document_id.eq.${d.id},receipt_document_id.eq.${d.id}`),
      ]);
      const ev = evaluate(d, vatClass, dupCount ?? 1, (payCount ?? 0) > 0);
      results.push({ document_id: d.id, ...ev, computed_at: new Date().toISOString() });
      await sb.from("evidence_documents").update({ quality_score: ev.score, quality_reasons: ev.reasons }).eq("id", d.id);
    }
    const { error: upErr } = await sb.from("finance_invoice_quality").upsert(results, { onConflict: "document_id" });
    if (upErr) return json({ error: upErr.message }, 500);
    return json({ ok: true, scored: results.length, results });
  } catch (e) { return json({ error: (e as Error).message }, 500); }
});

function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }