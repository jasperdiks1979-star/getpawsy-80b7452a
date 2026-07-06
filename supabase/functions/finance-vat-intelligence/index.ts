// finance-vat-intelligence — Phase 6 (VAT Intelligence surfaces).
// Read-only aggregation over finance_vat_classifications + evidence_documents.
// Splits VAT into four canonical buckets so Tax Readiness / Belastingdienst / KPI Strip
// can display exactly what is Recoverable now vs. Potential (blocked by evidence gaps)
// vs. Blocked (structural: reverse-charge/no-VAT/outside-EU) vs. Missing Evidence.
// Never fabricates values — every euro is traced back to an evidence_document.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Cls = {
  document_id: string;
  entity_id: string | null;
  bucket: string;
  vat_minor: number | null;
  recoverable_minor: number | null;
  non_deductible_minor: number | null;
  reverse_charge: boolean | null;
  import_vat: boolean | null;
  outside_eu: boolean | null;
  confidence: number | null;
  quarter: string | null;
  fiscal_year: number | null;
};
type Doc = {
  id: string;
  category: string | null;
  document_type: string | null;
  supplier_name: string | null;
  document_date: string | null;
  invoice_date: string | null;
  total_minor: number | null;
  amount_minor: number | null;
  vat_minor: number | null;
  vat_pct: number | null;
  currency: string | null;
  ocr_status: string | null;
  ocr_confidence: number | null;
  extraction_confidence: number | null;
  entity_id: string | null;
};

const CONF_FLOOR = 0.7; // low-confidence classifications go to Potential, never Recoverable

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const entityId: string | null = body?.entity_id ?? null;
    const fiscalYear: number | null = body?.fiscal_year ?? null;
    const quarter: string | null = body?.quarter ?? null;

    let clsQ = sb.from("finance_vat_classifications")
      .select("document_id,entity_id,bucket,vat_minor,recoverable_minor,non_deductible_minor,reverse_charge,import_vat,outside_eu,confidence,quarter,fiscal_year");
    if (entityId) clsQ = clsQ.eq("entity_id", entityId);
    if (fiscalYear) clsQ = clsQ.eq("fiscal_year", fiscalYear);
    if (quarter) clsQ = clsQ.eq("quarter", quarter);
    const { data: cls, error: clsErr } = await clsQ;
    if (clsErr) throw clsErr;

    let docQ = sb.from("evidence_documents")
      .select("id,category,document_type,supplier_name,document_date,invoice_date,total_minor,amount_minor,vat_minor,vat_pct,currency,ocr_status,ocr_confidence,extraction_confidence,entity_id");
    if (entityId) docQ = docQ.eq("entity_id", entityId);
    const { data: docs, error: docsErr } = await docQ;
    if (docsErr) throw docsErr;

    const clsList = (cls ?? []) as Cls[];
    const docList = (docs ?? []) as Doc[];
    const clsByDoc = new Map(clsList.map((c) => [c.document_id, c]));

    let recoverable = 0, potential = 0, blocked = 0, missing = 0;
    const missingDocs: string[] = [];
    const potentialReasons: Record<string, number> = {};
    const blockedReasons: Record<string, number> = {};

    for (const d of docList) {
      const c = clsByDoc.get(d.id);
      const isFinancial =
        d.category === "invoice" || d.category === "receipt" ||
        d.document_type === "invoice" || d.document_type === "receipt";
      if (!isFinancial) continue;

      // Missing Evidence: financial doc with no VAT figure and no classification.
      if (!c && d.vat_minor == null) {
        missing += Math.round(((d.total_minor ?? d.amount_minor ?? 0) * 0.21) / 1.21); // theoretical NL cap
        missingDocs.push(d.id);
        continue;
      }

      if (!c) {
        // Has a VAT figure but no classification yet → Potential (needs classify run).
        potential += Number(d.vat_minor ?? 0);
        potentialReasons["unclassified"] = (potentialReasons["unclassified"] ?? 0) + 1;
        continue;
      }

      const conf = Number(c.confidence ?? 0);
      const rec = Number(c.recoverable_minor ?? 0);
      const nd = Number(c.non_deductible_minor ?? 0);
      const vat = Number(c.vat_minor ?? 0);

      if (c.bucket === "standard_21" || c.bucket === "reduced_9") {
        if (conf >= CONF_FLOOR && rec > 0) recoverable += rec;
        else if (rec > 0) { potential += rec; potentialReasons["low_confidence"] = (potentialReasons["low_confidence"] ?? 0) + 1; }
        else if (vat > 0) { potential += vat; potentialReasons["classified_but_no_recoverable"] = (potentialReasons["classified_but_no_recoverable"] ?? 0) + 1; }
      } else if (c.bucket === "import") {
        if (conf >= CONF_FLOOR) recoverable += rec;
        else { potential += rec; potentialReasons["import_low_conf"] = (potentialReasons["import_low_conf"] ?? 0) + 1; }
      } else if (c.bucket === "reverse_charge") {
        blocked += vat; blockedReasons["reverse_charge"] = (blockedReasons["reverse_charge"] ?? 0) + 1;
      } else if (c.bucket === "outside_eu") {
        blocked += vat; blockedReasons["outside_eu"] = (blockedReasons["outside_eu"] ?? 0) + 1;
      } else if (c.bucket === "private") {
        blocked += nd; blockedReasons["private_use"] = (blockedReasons["private_use"] ?? 0) + 1;
      } else if (c.bucket === "no_vat" || c.bucket === "zero") {
        blocked += 0; blockedReasons[c.bucket] = (blockedReasons[c.bucket] ?? 0) + 1;
      } else {
        potential += vat; potentialReasons[c.bucket ?? "other"] = (potentialReasons[c.bucket ?? "other"] ?? 0) + 1;
      }
    }

    const buckets = {
      recoverable_minor: recoverable,
      potential_minor: potential,
      blocked_minor: blocked,
      missing_evidence_minor: missing,
    };
    const total = recoverable + potential + blocked + missing;
    const coverage = docList.length === 0 ? 0
      : Math.round(100 * clsList.length / docList.filter((d) => d.category === "invoice" || d.category === "receipt").length || 0);

    return new Response(JSON.stringify({
      ok: true,
      period: { entity_id: entityId, fiscal_year: fiscalYear, quarter },
      buckets,
      total_minor: total,
      classification_coverage_pct: Number.isFinite(coverage) ? coverage : 0,
      counts: {
        financial_documents: docList.filter((d) => d.category === "invoice" || d.category === "receipt").length,
        classified: clsList.length,
        missing_evidence_documents: missingDocs.length,
      },
      reasons: { potential: potentialReasons, blocked: blockedReasons },
      missing_evidence_document_ids: missingDocs.slice(0, 100),
      source: "finance-vat-intelligence:v1",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});