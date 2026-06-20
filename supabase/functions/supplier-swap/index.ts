import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sbAdmin, jsonResponse, RECOVERY_CORS } from "../_shared/recovery-engine.ts";

// Atomically swap a product's supplier while preserving slug, image, pins,
// media, reviews, and SEO. Admin-only.
// POST { productId, candidateId, reason?, executedBy? }
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: RECOVERY_CORS });
  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return jsonResponse({ ok: false, message: "Unauthorized" }, 401);
    const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return jsonResponse({ ok: false, message: "Forbidden" }, 403);

    const { productId, candidateId, reason } = await req.json().catch(() => ({}));
    if (!productId || !candidateId) return jsonResponse({ ok: false, error: "productId and candidateId required" }, 400);

    const sb = sbAdmin();
    const { data: product } = await sb.from("products").select("*").eq("id", productId).maybeSingle();
    const { data: cand } = await sb.from("product_supplier_candidates").select("*").eq("id", candidateId).maybeSingle();
    if (!product || !cand) return jsonResponse({ ok: false, error: "missing product or candidate" }, 404);

    const fromSnap = {
      cj_product_id: product.cj_product_id,
      supplier_sku: product.supplier_sku ?? null,
      price: product.price,
      cost_cents: product.cost_cents ?? null,
      us_stock: product.us_stock, eu_stock: product.eu_stock, cn_stock: product.cn_stock,
      effective_stock: product.effective_stock,
    };
    const toSnap = {
      cj_product_id: cand.supplier_product_id,
      supplier_sku: cand.supplier_sku,
      price_cents: cand.price_cents,
      global_qty: cand.global_qty,
      warehouses: cand.warehouses,
    };

    // Apply swap — keep slug, image_url, name (preserve SEO + creatives).
    const updates: Record<string, unknown> = {
      cj_product_id: cand.supplier_product_id,
      supplier_sku: cand.supplier_sku,
      effective_stock: cand.global_qty,
      updated_at: new Date().toISOString(),
    };
    if (cand.price_cents && (!product.price || product.price <= 0)) {
      updates.price = Number(cand.price_cents) / 100;
    }
    await sb.from("products").update(updates).eq("id", productId);

    await sb.from("product_supplier_swaps").insert({
      product_id: productId,
      from_snapshot: fromSnap,
      to_snapshot: toSnap,
      reason: reason ?? "auto",
      executed_by: user.id,
    });
    await sb.from("product_supplier_candidates").update({
      status: "promoted", decided_at: new Date().toISOString(),
    }).eq("id", candidateId);

    // Log creative continuity for revenue attribution.
    await sb.from("pinterest_evolution_log").insert({
      product_id: productId,
      action: "supplier_swap",
      details: { from: fromSnap, to: toSnap, reason: reason ?? "auto" },
    }).then(() => {}).catch(() => {});

    // Trigger live global re-audit so the new supplier's stock is recorded.
    await sb.functions.invoke("product-global-audit", { body: { productId } }).catch(() => {});

    return jsonResponse({ ok: true, productId, from: fromSnap, to: toSnap });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
});