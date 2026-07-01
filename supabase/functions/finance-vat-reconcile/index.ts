// Automated quarterly VAT reconciliation.
// Compares imported VAT (evidence_documents.vat_minor) against calculated VAT
// (finance_vat_summaries.vat_total_minor), flags discrepancies, and logs an
// audit-grade evidence row in finance_vat_reconciliations.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TOLERANCE_MINOR = 100;   // €1.00 absolute tolerance
const TOLERANCE_PCT = 1.0;     // 1% relative tolerance (aligned with CIE revenue truth)

function currentQuarter(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  // Reconcile the PREVIOUS completed quarter by default.
  const currentQ = Math.floor((m - 1) / 3) + 1;
  let q = currentQ - 1;
  let year = y;
  if (q === 0) { q = 4; year = y - 1; }
  return { year, quarter: q };
}

function quarterBounds(year: number, q: number) {
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

async function sha256(input: string) {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* body optional for cron */ }

  const triggeredBy = String(body.triggered_by ?? "cron");
  const periodType = (body.period_type as string) ?? "quarter";
  let year = Number(body.period_year);
  let quarter = Number(body.period_number);
  if (!year || !quarter) {
    const q = currentQuarter();
    year = q.year; quarter = q.quarter;
  }

  try {
    const { start, end } = quarterBounds(year, quarter);

    // 1. Calculated VAT from evidence documents (source of truth: imported invoices).
    const { data: docs, error: docsErr } = await supabase
      .from("evidence_documents")
      .select("id,title,supplier_name,invoice_number,document_date,vat_minor,amount_minor,currency,tax_country,category,ocr_status")
      .gte("document_date", start)
      .lt("document_date", end);
    if (docsErr) throw docsErr;

    let calculatedMinor = 0;
    const flagged: Array<Record<string, unknown>> = [];
    let missing = 0;
    for (const d of docs ?? []) {
      const v = Number(d.vat_minor ?? 0);
      calculatedMinor += v;
      if (d.vat_minor == null && (d.category === "invoice" || d.category === "receipt")) {
        missing++;
        flagged.push({ id: d.id, reason: "missing_vat", title: d.title, supplier: d.supplier_name });
      } else if (d.amount_minor && v > Number(d.amount_minor)) {
        flagged.push({ id: d.id, reason: "vat_exceeds_amount", title: d.title });
      } else if (d.ocr_status === "failed") {
        flagged.push({ id: d.id, reason: "ocr_failed", title: d.title });
      }
    }

    // 2. Imported VAT from previously computed summary.
    const { data: summary } = await supabase
      .from("finance_vat_summaries")
      .select("vat_total_minor,invoice_count,currency")
      .eq("period_type", periodType)
      .eq("period_year", year)
      .eq("period_number", quarter)
      .maybeSingle();

    const importedMinor = Number(summary?.vat_total_minor ?? 0);
    const currency = summary?.currency ?? "EUR";
    const delta = calculatedMinor - importedMinor;
    const base = Math.max(Math.abs(importedMinor), Math.abs(calculatedMinor), 1);
    const deltaPct = (Math.abs(delta) / base) * 100;

    let status: "ok" | "warning" | "discrepancy" | "error" = "ok";
    if (!summary) status = "warning";
    else if (Math.abs(delta) > TOLERANCE_MINOR && deltaPct > TOLERANCE_PCT) status = "discrepancy";
    else if (Math.abs(delta) > TOLERANCE_MINOR || flagged.length > 0) status = "warning";

    const fingerprintPayload = JSON.stringify({
      periodType, year, quarter, importedMinor, calculatedMinor,
      delta, deltaPct, invoiceCount: docs?.length ?? 0, missing,
      flaggedIds: flagged.map(f => f.id), at: new Date().toISOString(),
    });
    const fingerprint = await sha256(fingerprintPayload);

    const { data: inserted, error: insErr } = await supabase
      .from("finance_vat_reconciliations")
      .insert({
        period_type: periodType,
        period_year: year,
        period_number: quarter,
        status,
        currency,
        imported_vat_minor: importedMinor,
        calculated_vat_minor: calculatedMinor,
        delta_minor: delta,
        delta_pct: Number(deltaPct.toFixed(4)),
        invoice_count: docs?.length ?? 0,
        missing_docs: missing,
        flagged_documents: flagged.slice(0, 200),
        evidence_sha256: fingerprint,
        triggered_by: triggeredBy,
        details: {
          tolerance_minor: TOLERANCE_MINOR,
          tolerance_pct: TOLERANCE_PCT,
          window: { start, end },
          summary_present: !!summary,
          fingerprint_payload_bytes: fingerprintPayload.length,
        },
      })
      .select()
      .single();
    if (insErr) throw insErr;

    return new Response(JSON.stringify({
      ok: true,
      reconciliation: inserted,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("finance_vat_reconciliations").insert({
      period_type: periodType, period_year: year, period_number: quarter,
      status: "error", triggered_by: triggeredBy, notes: message,
    });
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});