import {
  sbAdmin, jsonResponse, RECOVERY_CORS, cjToken, fetchGlobalInventory,
} from "../_shared/recovery-engine.ts";

// Per-product live worldwide inventory check. POST { productId } or
// { productIds: [] }. Writes product_global_inventory rows.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: RECOVERY_CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = body.productIds ?? (body.productId ? [body.productId] : []);
    if (!ids.length) return jsonResponse({ ok: false, error: "productId(s) required" }, 400);

    const sb = sbAdmin();
    const token = await cjToken(sb);
    const { data: products } = await sb
      .from("products")
      .select("id, name, cj_product_id, slug, us_stock, eu_stock, cn_stock, effective_stock")
      .in("id", ids);

    const results: any[] = [];
    for (const p of (products ?? []) as any[]) {
      const pid = p.cj_product_id;
      if (!pid) {
        results.push({ id: p.id, status: "no_cj_pid" });
        continue;
      }
      const inv = await fetchGlobalInventory(token, pid);
      let globalQty = 0;
      const rows = inv.warehouses.map((w) => {
        globalQty += w.qty;
        return {
          product_id: p.id,
          supplier: "cj",
          warehouse: w.warehouse,
          country_code: w.country,
          qty: w.qty,
          shipping_days_min: w.shippingDays.min ?? null,
          shipping_days_max: w.shippingDays.max ?? null,
          raw: w.raw,
          last_checked_at: new Date().toISOString(),
        };
      });
      // Wipe stale rows then insert fresh.
      await sb.from("product_global_inventory").delete().eq("product_id", p.id).eq("supplier", "cj");
      if (rows.length) await sb.from("product_global_inventory").insert(rows);

      // Update aggregate columns on products.
      const us = rows.filter((r) => r.country_code === "US").reduce((s, r) => s + r.qty, 0);
      const eu = rows.filter((r) => ["DE", "GB", "FR", "ES", "IT", "NL"].includes(r.country_code ?? "")).reduce((s, r) => s + r.qty, 0);
      const cn = rows.filter((r) => r.country_code === "CN").reduce((s, r) => s + r.qty, 0);
      await sb.from("products").update({
        us_stock: us, eu_stock: eu, cn_stock: cn,
        effective_stock: globalQty,
        us_available: us > 0,
        eu_available: eu > 0,
      }).eq("id", p.id);

      results.push({
        id: p.id, status: inv.status, globalQty, warehouses: rows.length,
        breakdown: { us, eu, cn }, message: inv.message,
      });
    }
    return jsonResponse({ ok: true, results });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
});