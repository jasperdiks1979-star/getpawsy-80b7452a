// GENESIS V14 — finance-asset-depreciate
// Nightly cron: recompute current_book_value_cents for every active asset
// using linear depreciation with salvage floor.

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
  const { data: assets, error } = await admin
    .from("finance_assets")
    .select("id,purchase_date,purchase_amount_cents,salvage_value_cents,depreciation_method,depreciation_years,business_usage_pct,asset_status");
  if (error) return json({ ok: false, error: error.message }, 500);

  const today = new Date();
  const updates: { id: string; current_book_value_cents: number }[] = [];
  for (const a of assets ?? []) {
    if (a.asset_status !== "active" && a.asset_status !== "repair") continue;
    if (!a.purchase_date || !a.purchase_amount_cents) continue;
    const purchase = Number(a.purchase_amount_cents) * ((a.business_usage_pct ?? 100) / 100);
    const salvage = Number(a.salvage_value_cents ?? 0);
    let book = purchase;
    if (a.depreciation_method === "linear" && (a.depreciation_years ?? 0) > 0) {
      const yrs = a.depreciation_years!;
      const ageDays = (today.getTime() - new Date(a.purchase_date).getTime()) / 86400000;
      const rate = Math.min(1, ageDays / (yrs * 365));
      book = Math.max(salvage, purchase - (purchase - salvage) * rate);
    }
    updates.push({ id: a.id, current_book_value_cents: Math.round(book) });
  }

  // batched upsert
  for (let i = 0; i < updates.length; i += 200) {
    const batch = updates.slice(i, i + 200);
    await Promise.all(batch.map((u) =>
      admin.from("finance_assets").update({ current_book_value_cents: u.current_book_value_cents }).eq("id", u.id),
    ));
  }

  return json({ ok: true, updated: updates.length });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
