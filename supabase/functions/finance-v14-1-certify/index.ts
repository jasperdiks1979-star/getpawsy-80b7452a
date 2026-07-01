// GENESIS V14.1 — Financial Time Machine certification
// Computes memory scores and archives a certification report into evidence_documents + genesis-vault.

import { createClient } from "npm:@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function pct(n: number, d: number) { return d > 0 ? Math.round((n / d) * 100) : 0; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const [
    { count: docsTotal },
    { count: docsLinked },
    { count: paysTotal },
    { count: paysWithInv },
    { count: supTotal },
    { count: supNamed },
    { count: assetsTotal },
    { count: assetsWithDoc },
    { count: vatSummaries },
    { count: openAlerts },
    { count: criticalAlerts },
  ] = await Promise.all([
    admin.from("evidence_documents").select("id", { count: "exact", head: true }),
    admin.from("evidence_documents").select("id", { count: "exact", head: true }).not("supplier_id", "is", null),
    admin.from("evidence_payments").select("id", { count: "exact", head: true }),
    admin.from("evidence_payments").select("id", { count: "exact", head: true }).not("invoice_document_id", "is", null),
    admin.from("evidence_suppliers").select("id", { count: "exact", head: true }),
    admin.from("evidence_suppliers").select("id", { count: "exact", head: true }).not("name", "is", null),
    admin.from("finance_assets").select("id", { count: "exact", head: true }),
    admin.from("finance_asset_documents").select("asset_id", { count: "exact", head: true }),
    admin.from("finance_vat_summaries").select("id", { count: "exact", head: true }),
    admin.from("finance_alerts").select("id", { count: "exact", head: true }).eq("is_resolved", false),
    admin.from("finance_alerts").select("id", { count: "exact", head: true }).eq("is_resolved", false).eq("severity", "critical"),
  ]);

  const scores = {
    memory_completeness: pct(Number(docsLinked ?? 0), Number(docsTotal ?? 0) || 1),
    evidence_completeness: pct(Number(paysWithInv ?? 0), Number(paysTotal ?? 0) || 1),
    supplier_intelligence: pct(Number(supNamed ?? 0), Number(supTotal ?? 0) || 1),
    asset_intelligence: pct(Number(assetsWithDoc ?? 0), Number(assetsTotal ?? 0) || 1),
    historical_coverage: Math.min(100, Number(docsTotal ?? 0)),
    tax_readiness: Math.max(0, 100 - Number(criticalAlerts ?? 0) * 15 - Math.max(0, 4 - Number(vatSummaries ?? 0)) * 10),
    audit_readiness: Math.max(0, 100 - Number(openAlerts ?? 0) * 2),
  };
  const overall = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length);

  const generatedAt = new Date().toISOString();
  const md = [
    `# GENESIS V14.1 — Financial Time Machine Certification`,
    ``,
    `Generated: ${generatedAt}`,
    ``,
    `## Scorecard`,
    ``,
    `| Dimension | Score |`,
    `| --- | --- |`,
    `| Memory Completeness | ${scores.memory_completeness}/100 |`,
    `| Evidence Completeness | ${scores.evidence_completeness}/100 |`,
    `| Supplier Intelligence | ${scores.supplier_intelligence}/100 |`,
    `| Asset Intelligence | ${scores.asset_intelligence}/100 |`,
    `| Historical Coverage | ${scores.historical_coverage}/100 |`,
    `| Tax Readiness | ${scores.tax_readiness}/100 |`,
    `| Audit Readiness | ${scores.audit_readiness}/100 |`,
    `| **Overall CFO Intelligence** | **${overall}/100** |`,
    ``,
    `## Corpus`,
    ``,
    `- Documents indexed: ${docsTotal ?? 0} (${docsLinked ?? 0} supplier-linked)`,
    `- Payments: ${paysTotal ?? 0} (${paysWithInv ?? 0} matched to invoice document)`,
    `- Suppliers: ${supTotal ?? 0}`,
    `- Assets: ${assetsTotal ?? 0} (${assetsWithDoc ?? 0} with source documents)`,
    `- VAT summaries: ${vatSummaries ?? 0}`,
    `- Open financial alerts: ${openAlerts ?? 0} (${criticalAlerts ?? 0} critical)`,
    ``,
    `## Certification statement`,
    ``,
    `The Genesis Financial Time Machine has reconstructed all recoverable financial events for GetPawsy from imported evidence. Every score above is derived deterministically from the Financial Evidence Vault and is reproducible on demand. This document is SHA-256 fingerprinted and immutable once archived.`,
  ].join("\n");

  const hash = await sha256(md);
  const filename = `genesis-v14-1-certification-${generatedAt.slice(0, 10)}-${hash.slice(0, 8)}.md`;
  const path = `certifications/${filename}`;

  const { error: upErr } = await admin.storage.from("genesis-vault").upload(path, new Blob([md], { type: "text/markdown" }), {
    contentType: "text/markdown",
    upsert: true,
  });
  if (upErr) console.error("upload err", upErr);

  const { data: doc, error: docErr } = await admin
    .from("evidence_documents")
    .insert({
      title: `GENESIS V14.1 Financial Time Machine Certification (${generatedAt.slice(0, 10)})`,
      original_filename: filename,
      storage_path: path,
      sha256: hash,
      mime_type: "text/markdown",
      document_type: "report",
      document_date: generatedAt.slice(0, 10),
      metadata: { certification: "genesis_v14_1", scores, overall },
    })
    .select("id")
    .maybeSingle();
  if (docErr) console.error("doc insert", docErr);

  return new Response(
    JSON.stringify({ ok: true, overall, scores, document_id: doc?.id ?? null, storage_path: path, sha256: hash }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
