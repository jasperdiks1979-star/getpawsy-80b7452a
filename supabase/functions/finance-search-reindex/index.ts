// GENESIS V14 — finance-search-reindex
// Rebuilds finance_search_index from documents, suppliers, assets,
// subscriptions and payments. Idempotent upserts on (entity_type, entity_id).

import { createClient } from "npm:@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const rows: Array<{ entity_type: string; entity_id: string; title: string; body: string; metadata: Record<string, unknown> }> = [];

  const { data: docs } = await admin
    .from("evidence_documents")
    .select("id,original_filename,title,ocr_text,supplier_id,document_date,amount_minor,currency")
    .limit(5000);
  for (const d of docs ?? []) rows.push({
    entity_type: "document",
    entity_id: d.id,
    title: d.original_filename ?? d.title ?? "Document",
    body: [d.ocr_text ?? "", `${d.document_date ?? ""}`, `${d.amount_minor ?? ""} ${d.currency ?? ""}`].join(" ").slice(0, 8000),
    metadata: { document_date: d.document_date, amount_minor: d.amount_minor, currency: d.currency, supplier_id: d.supplier_id },
  });

  const { data: sups } = await admin.from("evidence_suppliers").select("id,name,slug,country,vat_number,category,notes");
  for (const s of sups ?? []) rows.push({
    entity_type: "supplier",
    entity_id: s.id,
    title: s.name,
    body: [s.slug, s.country, s.vat_number, s.category, s.notes].filter(Boolean).join(" "),
    metadata: { country: s.country },
  });

  const { data: assets } = await admin.from("finance_assets").select("id,name,serial,category,notes,asset_status");
  for (const a of assets ?? []) rows.push({
    entity_type: "asset",
    entity_id: a.id,
    title: a.name,
    body: [a.serial, a.category, a.notes, a.asset_status].filter(Boolean).join(" "),
    metadata: { category: a.category, status: a.asset_status },
  });

  const { data: subs } = await admin.from("finance_subscriptions").select("id,product_name,supplier_slug,cadence,notes,amount_minor,currency");
  for (const s of subs ?? []) rows.push({
    entity_type: "subscription",
    entity_id: s.id,
    title: s.product_name,
    body: [s.supplier_slug, s.cadence, s.notes, `${s.amount_minor} ${s.currency}`].filter(Boolean).join(" "),
    metadata: { cadence: s.cadence, amount_minor: s.amount_minor, currency: s.currency },
  });

  const { data: pays } = await admin.from("evidence_payments").select("id,supplier_id,amount_minor,currency,paid_at,bank_txn_reference").limit(5000);
  for (const p of pays ?? []) rows.push({
    entity_type: "payment",
    entity_id: p.id,
    title: `Payment ${p.bank_txn_reference ?? p.id.slice(0, 8)}`,
    body: [p.paid_at, `${p.amount_minor} ${p.currency ?? ""}`, p.bank_txn_reference].filter(Boolean).join(" "),
    metadata: { paid_at: p.paid_at, amount_minor: p.amount_minor, currency: p.currency, supplier_id: p.supplier_id },
  });

  let upserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await admin
      .from("finance_search_index")
      .upsert(batch, { onConflict: "entity_type,entity_id" });
    if (!error) upserted += batch.length;
    else console.error("[finance-search-reindex]", error.message);
  }

  return json({ ok: true, indexed: upserted });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
