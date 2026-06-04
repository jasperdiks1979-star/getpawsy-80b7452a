// CJ variant repair — backfills products.variants + variant_stock JSONB for
// CJ-mapped products that currently show 0 variants in admin.
//
// Why this exists: the CJ import pipeline writes images + aggregate stock
// into products, but does not always persist the per-variant rows. As a
// result products like "Elastic Extendable Reflective Dog Leash" show
// 11 images + 77,149 stock + "0 variants" in admin. This function fetches
// the live CJ payload via cj-dropshipping/details and persists the variants.
//
// Modes:
//   { mode: "audit" }                       → return counts only
//   { mode: "repair_one", product_id }      → fix a specific product
//   { mode: "repair_all", limit?: number }  → fix up to N products with
//                                             cj_product_id set + 0 variants
//
// Auth: admin (user_roles.role='admin') OR x-render-secret.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-render-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type CjInventory = { countryCode?: string; totalInventory?: number };
type CjVariant = {
  vid?: string;
  variantSku?: string;
  variantNameEn?: string;
  variantName?: string;
  variantImage?: string;
  variantSellPrice?: number | string;
  variantSpecs?: Array<{ specName?: string; specValue?: string }>;
  variantKey?: string;
  inventories?: CjInventory[];
  variantStandard?: string;
};

function extractColorSize(v: CjVariant): { color: string | null; size: string | null } {
  const out: { color: string | null; size: string | null } = { color: null, size: null };
  const tryFrom = (s?: string | null) => {
    if (!s) return;
    const parts = String(s).split(/[\-|·,/]+/).map((p) => p.trim()).filter(Boolean);
    for (const p of parts) {
      const low = p.toLowerCase();
      if (/(xs|s|m|l|xl|xxl|xxxl|[0-9]+(cm|mm|ml|l|kg|g|in)?)/i.test(p) && !out.size) {
        // very loose size detection
        if (/\d/.test(p) || /^(xs|s|m|l|xl|xxl|xxxl)$/i.test(p)) out.size = p;
      }
      if (!out.color && /^[a-z\s]{3,20}$/i.test(p) && !/\d/.test(p)) {
        // crude color heuristic — overwrite only if not set
        out.color = p;
      }
    }
  };
  if (Array.isArray(v.variantSpecs)) {
    for (const s of v.variantSpecs) {
      const name = (s?.specName ?? "").toLowerCase();
      const val = s?.specValue ?? "";
      if (name.includes("color") || name.includes("colour")) out.color = val || out.color;
      if (name.includes("size")) out.size = val || out.size;
    }
  }
  if (!out.color || !out.size) tryFrom(v.variantNameEn ?? v.variantName ?? null);
  return out;
}

function totalUsStock(v: CjVariant): number {
  if (!Array.isArray(v.inventories)) return 0;
  let us = 0;
  let other = 0;
  for (const inv of v.inventories) {
    const qty = Number(inv?.totalInventory ?? 0);
    if ((inv?.countryCode ?? "").toUpperCase() === "US") us += qty;
    else other += qty;
  }
  return us > 0 ? us : other;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);
  try {
    // Auth
    let isAdmin = false;
    const secret = req.headers.get("x-render-secret") ?? "";
    if (RENDER_WORKER_SECRET && secret === RENDER_WORKER_SECRET) {
      isAdmin = true;
    } else {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader) return json({ ok: false, traceId, message: "missing Authorization" }, 401);
      const user = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: ures } = await user.auth.getUser();
      if (!ures?.user) return json({ ok: false, traceId, message: "unauthorized" }, 401);
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: role } = await admin
        .from("user_roles").select("role")
        .eq("user_id", ures.user.id).eq("role", "admin").maybeSingle();
      isAdmin = Boolean(role);
      if (!isAdmin) return json({ ok: false, traceId, message: "admin required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const mode: string = body?.mode ?? "audit";
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Optional run row for realtime progress. Caller can pass run_id to
    // pre-create the row client-side, or we generate one server-side.
    const runId: string = body?.run_id ?? crypto.randomUUID();
    async function upsertRun(patch: Record<string, unknown>) {
      try {
        await admin
          .from("cj_variant_repair_runs")
          .upsert(
            { id: runId, mode, updated_at: new Date().toISOString(), ...patch },
            { onConflict: "id" },
          );
      } catch (_e) {
        // realtime progress is best-effort; never fail the run on it
      }
    }

    if (mode === "audit") {
      await upsertRun({ status: "running", total: 1, completed: 0 });
      // Inline audit: matches the report shape the admin asked for.
      const { data: rows, error } = await admin.rpc("cj_variant_audit_report").maybeSingle();
      if (error) {
        // Fallback to a simple SQL-based count using PostgREST
        const { data: list } = await admin
          .from("products")
          .select("id, name, slug, stock, images, variants, variant_stock, cj_product_id")
          .not("cj_product_id", "is", null)
          .limit(2000);
        const safe = (list ?? []) as Array<Record<string, any>>;
        const audit = {
          total_cj_products: safe.length,
          zero_variants: safe.filter((r) => !Array.isArray(r.variants) || r.variants.length === 0).length,
          zero_variants_but_stock: safe.filter((r) => (!Array.isArray(r.variants) || r.variants.length === 0) && Number(r.stock ?? 0) > 0).length,
          no_variant_stock: safe.filter((r) => !r.variant_stock).length,
          many_images_zero_variants: safe.filter((r) => Array.isArray(r.images) && r.images.length > 5 && (!Array.isArray(r.variants) || r.variants.length === 0)).length,
        };
        await upsertRun({
          status: "complete",
          completed: 1,
          last_result: audit,
          finished_at: new Date().toISOString(),
        });
        return json({ ok: true, traceId, run_id: runId, mode, audit });
      }
      await upsertRun({
        status: "complete",
        completed: 1,
        last_result: rows as Record<string, unknown>,
        finished_at: new Date().toISOString(),
      });
      return json({ ok: true, traceId, run_id: runId, mode, audit: rows });
    }

    // Helper: call cj-dropshipping/details for a single product id
    async function fetchCjDetails(cjProductId: string): Promise<any | null> {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/cj-dropshipping`, {
          method: "POST",
          headers: {
            "apikey": SERVICE_KEY,
            "Authorization": `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "getProductDetails", productIds: [cjProductId] }),
        });
        if (!r.ok) return null;
        const j = await r.json();
        const arr = Array.isArray(j?.results) ? j.results : Array.isArray(j) ? j : [];
        return arr.find((x: any) => x?.success && (x?.pid === cjProductId || x?.data));
      } catch {
        return null;
      }
    }

    async function repairOne(productRow: any): Promise<Record<string, unknown>> {
      const cjId = productRow.cj_product_id;
      if (!cjId) return { product_id: productRow.id, ok: false, reason: "no_cj_product_id" };
      const details = await fetchCjDetails(cjId);
      const variants: CjVariant[] | undefined = details?.variants ?? details?.data?.variants;
      if (!Array.isArray(variants) || variants.length === 0) {
        return { product_id: productRow.id, cj_product_id: cjId, ok: false, reason: "cj_returned_no_variants" };
      }
      const normalized = variants.map((v) => {
        const { color, size } = extractColorSize(v);
        const stock = totalUsStock(v);
        return {
          cj_vid: v.vid ?? null,
          sku: v.variantSku ?? null,
          name: v.variantNameEn ?? v.variantName ?? null,
          image: v.variantImage ?? null,
          price: v.variantSellPrice ?? null,
          color,
          size,
          stock,
          active: stock > 0,
        };
      });
      const variantStock: Record<string, number> = {};
      for (const n of normalized) {
        if (n.sku) variantStock[n.sku] = n.stock;
        else if (n.cj_vid) variantStock[String(n.cj_vid)] = n.stock;
      }
      const totalStock = normalized.reduce((acc, n) => acc + (Number(n.stock) || 0), 0);
      const { error: upErr } = await admin
        .from("products")
        .update({
          variants: normalized,
          variant_stock: variantStock,
          stock: totalStock > 0 ? totalStock : productRow.stock,
          last_inventory_sync_at: new Date().toISOString(),
          last_inventory_sync_status: "variant_repair_ok",
          last_inventory_sync_error: null,
        })
        .eq("id", productRow.id);
      if (upErr) {
        return { product_id: productRow.id, ok: false, reason: `db_update_failed: ${upErr.message}` };
      }
      return {
        product_id: productRow.id,
        cj_product_id: cjId,
        ok: true,
        variants_written: normalized.length,
        total_stock: totalStock,
        sample: normalized.slice(0, 3),
      };
    }

    if (mode === "repair_one") {
      const productId = body?.product_id;
      if (!productId) return json({ ok: false, traceId, message: "product_id required" }, 400);
      const { data: row, error } = await admin
        .from("products")
        .select("id, name, slug, stock, cj_product_id, variants, variant_stock")
        .eq("id", productId).maybeSingle();
      if (error || !row) return json({ ok: false, traceId, message: "product_not_found" }, 404);
      await upsertRun({
        status: "running",
        total: 1,
        completed: 0,
        current_product_id: row.id,
        current_product_name: row.name,
      });
      const result = await repairOne(row);
      await upsertRun({
        status: "complete",
        completed: 1,
        repaired: result.ok ? 1 : 0,
        failed: result.ok ? 0 : 1,
        last_result: result,
        results: [result],
        current_product_id: null,
        current_product_name: null,
        finished_at: new Date().toISOString(),
      });
      return json({ ok: true, traceId, run_id: runId, mode, result });
    }

    if (mode === "repair_all") {
      const limit = Math.min(Math.max(Number(body?.limit ?? 25), 1), 200);
      const { data: list, error } = await admin
        .from("products")
        .select("id, name, slug, stock, cj_product_id, variants, variant_stock")
        .not("cj_product_id", "is", null)
        .limit(2000);
      if (error) return json({ ok: false, traceId, message: error.message }, 500);
      const candidates = (list ?? []).filter((r: any) => !Array.isArray(r.variants) || r.variants.length === 0).slice(0, limit);
      await upsertRun({
        status: "running",
        total: candidates.length,
        completed: 0,
        repaired: 0,
        failed: 0,
        results: [],
      });
      const results: any[] = [];
      let okCount = 0;
      let failCount = 0;
      for (const row of candidates) {
        // sequential to avoid CJ rate limits
        await upsertRun({
          current_product_id: row.id,
          current_product_name: row.name,
        });
        // eslint-disable-next-line no-await-in-loop
        const r = await repairOne(row);
        results.push(r);
        if (r.ok) okCount++; else failCount++;
        await upsertRun({
          completed: results.length,
          repaired: okCount,
          failed: failCount,
          last_result: r,
          results,
        });
      }
      const ok = results.filter((r) => r.ok).length;
      await upsertRun({
        status: "complete",
        current_product_id: null,
        current_product_name: null,
        finished_at: new Date().toISOString(),
      });
      return json({
        ok: true, traceId, run_id: runId, mode,
        scanned: candidates.length,
        repaired: ok,
        failed: results.length - ok,
        results,
      });
    }

    return json({ ok: false, traceId, message: `unknown mode: ${mode}` }, 400);
  } catch (e) {
    return json({ ok: false, traceId, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});