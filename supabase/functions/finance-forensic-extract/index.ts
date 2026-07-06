// Wave D1 — Forensic extraction: reads existing OCR text + evidence_documents,
// asks Lovable AI to normalize into an accounting record, writes:
//   - finance_document_extractions (append-only versioned)
//   - evidence_documents (enrichment columns, only when currently null)
// Idempotent per (document_id, version, extractor).
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const REQUIRED = [
  "legal_name","vat_number","kvk","invoice_number","po_number",
  "invoice_date","due_date","payment_date","currency","fx_rate",
  "subtotal_minor","vat_minor","vat_pct","total_minor","reverse_charge",
  "import_vat_minor","non_deductible_vat_minor","recoverable_vat_minor",
  "country","payment_method","bookkeeping_category","expense_category",
];

const SYSTEM = `You are a Dutch forensic accounting extractor. Return STRICT JSON only.
Amounts in EUR minor units (cents) as integers. Dates ISO (YYYY-MM-DD).
Never invent values — if unknown, use null and add the field name to "missing_fields".
For every non-null field return a per-field confidence 0..1 in "field_confidence".
Include short "reasoning" explaining supplier / VAT / category decisions.`;

function buildPrompt(doc: Record<string, unknown>) {
  return `Normalize this invoice into an accounting record.
Existing OCR:\n${(doc.ocr_text as string ?? "").slice(0, 12000)}
Known hints: supplier=${doc.supplier_name ?? "?"} title=${doc.title ?? "?"} category=${doc.category ?? "?"} currency=${doc.currency ?? "?"} total=${doc.amount_minor ?? "?"}
Return JSON with fields: ${REQUIRED.join(", ")}, missing_fields (string[]), field_confidence (object), reasoning (object), overall_confidence (0..1).`;
}

async function callAI(prompt: string) {
  if (!LOVABLE_API_KEY) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const content = j.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(content); } catch { return {}; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { document_id, force } = await req.json();
    if (!document_id) return json({ error: "document_id required" }, 400);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: doc, error } = await sb.from("evidence_documents").select("*").eq("id", document_id).maybeSingle();
    if (error || !doc) return json({ error: "document not found" }, 404);

    if (!force) {
      const { data: prior } = await sb.from("finance_document_extractions")
        .select("id").eq("document_id", document_id).eq("document_version", doc.version).eq("extractor", "forensic-v1").limit(1);
      if (prior && prior.length > 0) return json({ ok: true, skipped: "already-extracted" });
    }

    const norm = await callAI(buildPrompt(doc));
    const conf = typeof norm.overall_confidence === "number" ? norm.overall_confidence : null;
    const missing = Array.isArray(norm.missing_fields) ? norm.missing_fields : REQUIRED.filter((k) => norm[k] == null);

    await sb.from("finance_document_extractions").insert({
      document_id, document_version: doc.version, extractor: "forensic-v1",
      model: "google/gemini-3-flash-preview", raw_extraction: norm, normalized: norm,
      confidence: conf, reasoning: norm.reasoning ?? {},
    });

    // Only fill columns that are currently null (never overwrite verified data).
    const patch: Record<string, unknown> = { missing_fields: missing, extraction_confidence: conf };
    for (const k of REQUIRED) {
      if (norm[k] == null) continue;
      if ((doc as any)[k] == null) patch[k] = norm[k];
    }
    patch.validation_state = missing.length === 0 && (conf ?? 0) >= 0.9 ? "verified"
      : (conf ?? 0) >= 0.7 ? "needs_review" : "missing_evidence";
    patch.bookkeeping_readiness = patch.validation_state;

    const { error: upErr } = await sb.from("evidence_documents").update(patch).eq("id", document_id);
    if (upErr) return json({ error: upErr.message }, 500);

    return json({ ok: true, confidence: conf, missing_fields: missing, patched: Object.keys(patch) });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}