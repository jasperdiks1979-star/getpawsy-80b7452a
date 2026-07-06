// finance-evidence-discover — Phase 2 + 9 (Autonomous Evidence Discovery + Unknown Elimination)
// For every evidence_documents row lacking a supplier_id, infers the LIKELY supplier
// from OCR text, filename, provider hints and existing supplier slugs/aliases.
// Never fabricates financial values. Never overwrites human-corrected assignments.
// Only auto-assigns supplier_id when confidence >= AUTO_ASSIGN_THRESHOLD; otherwise
// stores predictions in evidence_documents.metadata.likely_supplier.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const AUTO_ASSIGN_THRESHOLD = 95;

type Sup = { id: string; name: string; slug: string; website: string | null; vat_number: string | null };
type Doc = {
  id: string;
  title: string | null;
  original_filename: string | null;
  document_type: string | null;
  ocr_text: string | null;
  invoice_number: string | null;
  supplier_name: string | null;
  metadata: Record<string, unknown> | null;
  source: string | null;
};

type Candidate = { supplier_id: string; supplier_name: string; confidence: number; reasons: string[] };

function tokens(s: string | null | undefined): string[] {
  if (!s) return [];
  return String(s).toLowerCase().replace(/[^a-z0-9\s\-\.]/g, " ").split(/\s+/).filter(Boolean);
}

function scoreDoc(doc: Doc, suppliers: Sup[]): Candidate[] {
  const haystack = [
    doc.title, doc.original_filename, doc.supplier_name, doc.invoice_number,
    doc.source, doc.ocr_text?.slice(0, 4000) ?? "",
  ].filter(Boolean).join(" \n ").toLowerCase();

  if (!haystack.trim()) return [];

  const out: Candidate[] = [];
  for (const s of suppliers) {
    const reasons: string[] = [];
    let score = 0;
    const slugRe = new RegExp(`\\b${s.slug.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    const nameRe = new RegExp(`\\b${s.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    if (slugRe.test(haystack)) { score += 55; reasons.push(`Supplier slug '${s.slug}' matched.`); }
    if (nameRe.test(haystack)) { score += 45; reasons.push(`Supplier name '${s.name}' matched.`); }
    if (s.website) {
      const domain = s.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
      if (domain && haystack.includes(domain)) { score += 40; reasons.push(`Domain '${domain}' present in evidence.`); }
    }
    if (s.vat_number && haystack.includes(s.vat_number.toLowerCase())) {
      score += 60; reasons.push(`VAT number '${s.vat_number}' matched.`);
    }
    // Provider hint (e.g. source='stripe' or filename 'stripe_receipt.pdf')
    if (doc.source && doc.source.toLowerCase().includes(s.slug.toLowerCase())) {
      score += 30; reasons.push(`Source field indicates '${s.slug}'.`);
    }
    if (score > 0) {
      out.push({
        supplier_id: s.id,
        supplier_name: s.name,
        confidence: Math.min(100, score),
        reasons,
      });
    }
  }
  out.sort((a, b) => b.confidence - a.confidence);
  return out.slice(0, 3);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body?.dry_run !== false; // default: dry-run
    const limit: number = Math.max(1, Math.min(200, Number(body?.limit ?? 100)));

    const { data: suppliers } = await sb
      .from("evidence_suppliers")
      .select("id,name,slug,website,vat_number");

    const { data: docs } = await sb
      .from("evidence_documents")
      .select("id,title,original_filename,document_type,ocr_text,invoice_number,supplier_name,metadata,source,supplier_id")
      .is("supplier_id", null)
      .limit(limit);

    const now = new Date().toISOString();
    const results: any[] = [];
    let autoAssigned = 0;
    let predictionsStored = 0;
    let unresolved = 0;

    for (const d of (docs ?? []) as (Doc & { supplier_id: string | null })[]) {
      const candidates = scoreDoc(d, (suppliers ?? []) as Sup[]);
      const top = candidates[0];

      // Never touch human-corrected records.
      const meta = (d.metadata ?? {}) as any;
      const humanLocked = meta?.supplier_source === "human";

      if (!top) {
        unresolved++;
        results.push({ document_id: d.id, verdict: "Missing Evidence", top: null, candidates: [] });
        if (!dryRun && !humanLocked) {
          await sb.from("evidence_documents").update({
            metadata: { ...meta, likely_supplier: null, discovery_ran_at: now, discovery_verdict: "unresolved" },
          }).eq("id", d.id);
        }
        continue;
      }

      if (!dryRun && !humanLocked) {
        if (top.confidence >= AUTO_ASSIGN_THRESHOLD) {
          await sb.from("evidence_documents").update({
            supplier_id: top.supplier_id,
            supplier_name: top.supplier_name,
            metadata: {
              ...meta,
              supplier_source: "discovery",
              likely_supplier: top,
              discovery_candidates: candidates,
              discovery_ran_at: now,
              discovery_verdict: "auto_assigned",
            },
          }).eq("id", d.id);
          autoAssigned++;
        } else {
          await sb.from("evidence_documents").update({
            metadata: {
              ...meta,
              likely_supplier: top,
              discovery_candidates: candidates,
              discovery_ran_at: now,
              discovery_verdict: "predicted",
            },
          }).eq("id", d.id);
          predictionsStored++;
        }
      }

      results.push({
        document_id: d.id,
        title: d.title,
        verdict: top.confidence >= AUTO_ASSIGN_THRESHOLD ? "Verified" : "Estimated",
        top,
        candidates,
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      dry_run: dryRun,
      scanned: (docs ?? []).length,
      auto_assigned: autoAssigned,
      predictions_stored: predictionsStored,
      unresolved,
      auto_assign_threshold: AUTO_ASSIGN_THRESHOLD,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});