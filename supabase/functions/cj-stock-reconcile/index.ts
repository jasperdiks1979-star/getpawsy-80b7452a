// CJ Stock Reconciliation — single source of truth = variant.inventories[]
// for countryCode === "US". Iterates CJ-mapped products in batches, fetches
// the live CJ payload, recomputes US stock per variant, and corrects
// products.stock / variant_stock / variants / is_active.
//
// Body:
//   { offset?: number, batch_size?: number, dry_run?: boolean,
//     run_id?: string, product_ids?: string[] }
//
// Returns:
//   { ok, run_id, processed, total, next_offset|null, done, totals,
//     corrections: [{product_id, slug, cj_product_id, old_db_stock,
//                    new_cj_us_stock, reason, deactivated}] }
//
// Every correction is also logged into cj_sync_items so this is auditable.
// Idempotent: re-running on already-reconciled rows is a no-op.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type CjInv = { countryCode?: string; totalInventory?: number; cjInventory?: number; storageNum?: number; stock?: Array<{ inventory?: number }> };
type CjVariant = {
  vid?: string;
  pid?: string;
  variantKey?: string;
  variantName?: string;
  variantNameEn?: string;
  variantSku?: string;
  variantImage?: string;
  variantSellPrice?: number | string;
  variantCostPrice?: number | string;
  variantSugSellPrice?: number | string;
  variantWeight?: number | string;
  variantLength?: number | string;
  variantWidth?: number | string;
  variantHeight?: number | string;
  variantStandard?: string;
  inventories?: CjInv[];
};

function usStockOf(v: CjVariant): number {
  if (!Array.isArray(v.inventories)) return 0;
  let us = 0;
  for (const inv of v.inventories) {
    if (String(inv?.countryCode ?? "").toUpperCase() !== "US") continue;
    let qty = Number(inv?.totalInventory ?? 0);
    if (!qty) qty = Number(inv?.cjInventory ?? 0);
    if (!qty && Array.isArray(inv?.stock)) {
      qty = inv!.stock!.reduce((s, n) => s + Number(n?.inventory ?? 0), 0);
    }
    if (!qty) qty = Number(inv?.storageNum ?? 0);
    if (Number.isFinite(qty) && qty > 0) us += qty;
  }
  return us;
}

async function fetchCjDetails(cjProductId: string): Promise<any | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/cj-dropshipping`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "get-product-details",
        productId: cjProductId,
        countryCode: "US",
      }),
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return j?.data ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);
  try {
    // Auth
    let isAdmin = false;
    const secret = req.headers.get("x-internal-secret") ?? "";
    if (INTERNAL_SECRET && secret === INTERNAL_SECRET) {
      isAdmin = true;
    } else {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader) return json({ ok: false, traceId, message: "missing Authorization" }, 401);
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: ures } = await userClient.auth.getUser();
      if (!ures?.user) return json({ ok: false, traceId, message: "unauthorized" }, 401);
      const admin0 = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: role } = await admin0
        .from("user_roles")
        .select("role")
        .eq("user_id", ures.user.id)
        .eq("role", "admin")
        .maybeSingle();
      isAdmin = Boolean(role);
      if (!isAdmin) return json({ ok: false, traceId, message: "admin required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const offset = Math.max(0, Number(body?.offset ?? 0));
    const batchSize = Math.min(Math.max(Number(body?.batch_size ?? 10), 1), 25);
    const dryRun = Boolean(body?.dry_run);
    const productIds: string[] | undefined = Array.isArray(body?.product_ids) ? body.product_ids : undefined;
    const runId: string = body?.run_id ?? crypto.randomUUID();

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Ensure run row
    if (offset === 0) {
      await admin.from("cj_sync_runs").upsert({
        id: runId,
        mode: dryRun ? "stock_reconcile_dry" : "stock_reconcile",
        status: "running",
        started_at: new Date().toISOString(),
        totals: {},
      }, { onConflict: "id" });
    }

    // Build candidate list
    let query = admin
      .from("products")
      .select("id, slug, name, stock, variants, variant_stock, is_active, cj_product_id", { count: "exact" })
      .not("cj_product_id", "is", null)
      .order("id", { ascending: true });
    if (productIds && productIds.length > 0) query = query.in("id", productIds);
    const { data: rows, count, error } = await query.range(offset, offset + batchSize - 1);
    if (error) return json({ ok: false, traceId, message: error.message }, 500);

    const total = productIds?.length ?? count ?? 0;
    const corrections: any[] = [];
    const totals = {
      processed: 0,
      stock_unchanged: 0,
      stock_corrected: 0,
      stale_stock_zeroed: 0,
      deactivated: 0,
      cj_fetch_failed: 0,
      out_of_stock_everywhere: 0,
      no_us_stock_only_other_warehouse: 0,
      variants_rebuilt: 0,
    };

    for (const p of rows ?? []) {
      totals.processed++;
      const cjId = p.cj_product_id as string;
      const details = await fetchCjDetails(cjId);
      if (!details) {
        totals.cj_fetch_failed++;
        await admin.from("cj_sync_items").insert({
          run_id: runId,
          product_id: p.id,
          product_name: p.name ?? p.slug,
          action: "stock_reconcile_fetch_failed",
          error: "cj_details_unavailable",
        });
        continue;
      }
      const variants: CjVariant[] = Array.isArray(details?.variants) ? details.variants : [];

      // Sum US stock from inventories[]
      let cjUsTotal = 0;
      let cjOtherTotal = 0;
      const perVariantUs: Record<string, number> = {};
      for (const v of variants) {
        const us = usStockOf(v);
        cjUsTotal += us;
        const key = v.variantSku ?? v.vid ?? v.variantKey ?? "";
        if (key) perVariantUs[String(key)] = us;
        if (Array.isArray(v.inventories)) {
          for (const inv of v.inventories) {
            if (String(inv?.countryCode ?? "").toUpperCase() === "US") continue;
            const qty = Number(inv?.totalInventory ?? inv?.cjInventory ?? inv?.storageNum ?? 0);
            if (Number.isFinite(qty) && qty > 0) cjOtherTotal += qty;
          }
        }
      }

      const oldStock = Number(p.stock ?? 0);
      const reasons: string[] = [];
      if (cjUsTotal === 0 && cjOtherTotal === 0) reasons.push("out_of_stock_everywhere");
      else if (cjUsTotal === 0 && cjOtherTotal > 0) reasons.push("no_us_stock_only_other_warehouse");

      const shouldZero = cjUsTotal === 0;
      const newStock = cjUsTotal;
      const stockChanged = oldStock !== newStock;
      const willDeactivate = shouldZero && p.is_active !== false;

      // Build normalized variants payload (preserves CJ fields + us_stock)
      const normalizedVariants = variants.map((v) => {
        const us = usStockOf(v);
        return {
          pid: v.pid ?? null,
          vid: v.vid ?? null,
          variantKey: v.variantKey ?? null,
          variantName: v.variantName ?? null,
          variantNameEn: v.variantNameEn ?? null,
          variantSku: v.variantSku ?? null,
          variantImage: v.variantImage ?? null,
          variantSellPrice: v.variantSellPrice ?? null,
          variantCostPrice: v.variantCostPrice ?? null,
          variantSugSellPrice: v.variantSugSellPrice ?? null,
          variantWeight: v.variantWeight ?? null,
          variantLength: v.variantLength ?? null,
          variantWidth: v.variantWidth ?? null,
          variantHeight: v.variantHeight ?? null,
          variantStandard: v.variantStandard ?? null,
          inventories: v.inventories ?? [],
          us_stock: us,
          active: us > 0,
        };
      });

      // Variant stock map — zero everything when shouldZero
      const variantStockOut: Record<string, number> = {};
      for (const [k, v] of Object.entries(perVariantUs)) {
        variantStockOut[k] = shouldZero ? 0 : v;
      }

      const before = { stock: oldStock, is_active: p.is_active, variants_count: Array.isArray(p.variants) ? (p.variants as any[]).length : 0 };
      const after = { stock: newStock, is_active: shouldZero ? false : true, variants_count: normalizedVariants.length, reasons };

      if (!dryRun) {
        const update: Record<string, any> = {
          stock: newStock,
          variant_stock: variantStockOut,
          last_inventory_sync_at: new Date().toISOString(),
          last_inventory_sync_status: shouldZero ? "out_of_stock" : "in_stock",
          last_inventory_sync_error: null,
        };
        if (normalizedVariants.length > 0) {
          update.variants = normalizedVariants;
          totals.variants_rebuilt++;
        }
        if (shouldZero) update.is_active = false;
        else update.is_active = true;

        const { error: upErr } = await admin.from("products").update(update).eq("id", p.id);
        if (upErr) {
          await admin.from("cj_sync_items").insert({
            run_id: runId,
            product_id: p.id,
            product_name: p.name ?? p.slug,
            action: "stock_reconcile_failed",
            before, after,
            error: upErr.message,
          });
          continue;
        }
      }

      if (stockChanged) {
        totals.stock_corrected++;
        if (oldStock > 0 && newStock === 0) totals.stale_stock_zeroed++;
      } else {
        totals.stock_unchanged++;
      }
      if (willDeactivate) totals.deactivated++;
      if (reasons.includes("out_of_stock_everywhere")) totals.out_of_stock_everywhere++;
      if (reasons.includes("no_us_stock_only_other_warehouse")) totals.no_us_stock_only_other_warehouse++;

      const correction = {
        product_id: p.id,
        slug: p.slug,
        cj_product_id: cjId,
        old_db_stock: oldStock,
        new_cj_us_stock: newStock,
        deactivated: willDeactivate,
        reasons,
        dry_run: dryRun,
      };
      if (stockChanged || willDeactivate) corrections.push(correction);

      // Always log a reconcile attempt for traceability
      await admin.from("cj_sync_items").insert({
        run_id: runId,
        product_id: p.id,
        product_name: p.name ?? p.slug,
        action: dryRun
          ? "stock_reconcile_dry_run"
          : (stockChanged ? (shouldZero ? "stale_stock_zeroed" : "stock_corrected") : "stock_unchanged"),
        before, after,
      });
    }

    const nextOffset = (rows?.length ?? 0) < batchSize ? null : offset + batchSize;
    const done = nextOffset === null;
    if (done) {
      await admin.from("cj_sync_runs").update({
        status: "complete",
        finished_at: new Date().toISOString(),
        totals,
      }).eq("id", runId);
    }

    return json({
      ok: true,
      traceId,
      run_id: runId,
      offset,
      processed: rows?.length ?? 0,
      total,
      next_offset: nextOffset,
      done,
      totals,
      corrections,
    });
  } catch (e) {
    return json({ ok: false, traceId, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});