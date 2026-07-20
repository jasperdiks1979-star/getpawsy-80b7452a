// Wave D1 — Dutch VAT classification. Deterministic rules first; escalates to AI only when ambiguous.
// Buckets: standard_21 | reduced_9 | zero | reverse_charge | import | oss | outside_eu | mixed | private | no_vat
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EU = new Set(["NL","BE","DE","FR","IT","ES","PT","IE","LU","AT","FI","SE","DK","PL","CZ","SK","HU","RO","BG","GR","HR","SI","EE","LV","LT","MT","CY"]);

type Bucket = "standard_21"|"reduced_9"|"zero"|"reverse_charge"|"import"|"oss"|"outside_eu"|"mixed"|"private"|"no_vat";

function classify(doc: any): { bucket: Bucket; recoverable: number|null; non_deductible: number|null; import_vat: boolean; reverse_charge: boolean; oss: boolean; outside_eu: boolean; mixed: boolean; confidence: number; reasoning: Record<string,string>; } {
  const reasoning: Record<string,string> = {};
  const vat = Number(doc.vat_minor ?? 0);
  const total = Number(doc.total_minor ?? doc.amount_minor ?? 0);
  const pct = doc.vat_pct != null ? Number(doc.vat_pct) : (total > 0 && vat > 0 ? Math.round((vat / (total - vat)) * 100) : null);
  const country = (doc.country ?? doc.tax_country ?? "").toUpperCase();
  const hasVatNumber = !!doc.vat_number;
  const reverseCharge = doc.reverse_charge === true || /reverse\s*charge|btw\s*verlegd/i.test(doc.ocr_text ?? "");
  const importVat = /douane|import\s*duty|invoerbtw|customs/i.test(doc.ocr_text ?? "") || /douane/i.test(doc.supplier_name ?? "");

  let bucket: Bucket = "no_vat";
  if (importVat) { bucket = "import"; reasoning.import = "Detected import VAT keywords"; }
  else if (reverseCharge) { bucket = "reverse_charge"; reasoning.rc = "Reverse charge marker present"; }
  else if (country && country !== "NL" && EU.has(country) && hasVatNumber) { bucket = "reverse_charge"; reasoning.rc = "EU cross-border B2B with VAT number → reverse charge"; }
  else if (country && !EU.has(country) && country !== "") { bucket = "outside_eu"; reasoning.outside = `Non-EU supplier country ${country}`; }
  else if (pct === 21) { bucket = "standard_21"; reasoning.pct = "VAT rate 21% (NL standard)"; }
  else if (pct === 9) { bucket = "reduced_9"; reasoning.pct = "VAT rate 9% (NL reduced)"; }
  else if (pct === 0) { bucket = "zero"; reasoning.pct = "VAT rate 0%"; }
  else if (vat === 0 && total > 0) { bucket = "no_vat"; reasoning.novat = "No VAT on invoice"; }

  const recoverable = bucket === "standard_21" || bucket === "reduced_9" ? vat
    : bucket === "reverse_charge" ? 0
    : bucket === "import" ? vat
    : 0;
  const non_deductible = bucket === "private" ? vat : 0;

  // Confidence heuristic
  let confidence = 0.5;
  if (pct != null) confidence += 0.2;
  if (country) confidence += 0.1;
  if (hasVatNumber) confidence += 0.1;
  if (bucket !== "no_vat") confidence += 0.1;
  confidence = Math.min(0.99, confidence);

  return { bucket, recoverable, non_deductible, import_vat: importVat, reverse_charge: reverseCharge || bucket === "reverse_charge", oss: false, outside_eu: bucket === "outside_eu", mixed: false, confidence, reasoning };
}

function quarter(dateStr: string | null): { q: string | null; y: number | null } {
  if (!dateStr) return { q: null, y: null };
  const d = new Date(dateStr);
  if (isNaN(+d)) return { q: null, y: null };
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return { q: `Q${q}`, y: d.getUTCFullYear() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { document_id, document_ids } = await req.json().catch(() => ({}));
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const ids: string[] = document_id ? [document_id] : Array.isArray(document_ids) ? document_ids : [];
    if (ids.length === 0) return json({ error: "document_id or document_ids required" }, 400);

    const { data: docs, error } = await sb.from("evidence_documents")
      .select("id,entity_id,vat_number,vat_minor,vat_pct,total_minor,amount_minor,country,tax_country,supplier_name,ocr_text,invoice_date,document_date,reverse_charge")
      .in("id", ids);
    if (error) return json({ error: error.message }, 500);

    const rows = (docs ?? []).map((d: any) => {
      const c = classify(d);
      const { q, y } = quarter(d.invoice_date ?? d.document_date);
      return {
        document_id: d.id, entity_id: d.entity_id ?? null,
        bucket: c.bucket, vat_pct: d.vat_pct ?? null, vat_minor: d.vat_minor ?? null,
        recoverable_minor: c.recoverable, non_deductible_minor: c.non_deductible,
        reverse_charge: c.reverse_charge, import_vat: c.import_vat, oss: c.oss, outside_eu: c.outside_eu, mixed: c.mixed,
        country: (d.country ?? d.tax_country) ?? null, quarter: q, fiscal_year: y,
        confidence: c.confidence, reasoning: c.reasoning, source: "finance-vat-classify:v1",
      };
    });

    const { error: upErr } = await sb.from("finance_vat_classifications").upsert(rows, { onConflict: "document_id" });
    if (upErr) return json({ error: upErr.message }, 500);
    return json({ ok: true, classified: rows.length, rows });
  } catch (e) { return json({ error: (e as Error).message }, 500); }
});

function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }