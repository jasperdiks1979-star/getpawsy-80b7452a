import {
  sbAdmin, jsonResponse, RECOVERY_CORS, cjToken, searchCjCatalog,
  fetchGlobalInventory, scoreCandidate,
} from "../_shared/recovery-engine.ts";

// Finds ≥10 alternative CJ listings for a product. POST { productId }.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: RECOVERY_CORS });
  try {
    const { productId } = await req.json().catch(() => ({}));
    if (!productId) return jsonResponse({ ok: false, error: "productId required" }, 400);
    const sb = sbAdmin();
    const { data: product } = await sb
      .from("products")
      .select("id, name, price, weight_g, category, cj_product_id")
      .eq("id", productId)
      .maybeSingle();
    if (!product) return jsonResponse({ ok: false, error: "product not found" }, 404);

    const token = await cjToken(sb);
    // Build keyword from name — strip filler words.
    const kw = (product.name ?? "")
      .replace(/[^a-zA-Z0-9 ]+/g, " ")
      .split(/\s+/).filter((w: string) => w.length > 3).slice(0, 4).join(" ");
    if (!kw) return jsonResponse({ ok: false, error: "no keyword" }, 400);

    const list = await searchCjCatalog(token, kw, 25);
    const candidates: any[] = [];
    for (const c of list) {
      const pid = String(c.pid ?? c.productId ?? "");
      if (!pid || pid === product.cj_product_id) continue;
      const inv = await fetchGlobalInventory(token, pid).catch(() => ({ warehouses: [], status: "error" as const }));
      const globalQty = inv.warehouses.reduce((s, w) => s + w.qty, 0);
      const { score, signals } = scoreCandidate(product, c, globalQty);
      candidates.push({
        product_id: productId,
        supplier: "cj",
        supplier_product_id: pid,
        supplier_sku: String(c.productSku ?? "") || null,
        title: String(c.productNameEn ?? c.productName ?? ""),
        image_url: String(c.productImage ?? c.image ?? "") || null,
        price_cents: Math.round(Number(c.sellPrice ?? 0) * 100) || null,
        global_qty: globalQty,
        warehouses: inv.warehouses.map((w) => ({ wh: w.warehouse, c: w.country, q: w.qty })),
        match_score: Number((score * 100).toFixed(2)),
        signals,
        status: globalQty > 0 ? "available" : "out_of_stock",
        discovered_at: new Date().toISOString(),
      });
      if (candidates.length >= 12) break;
    }
    candidates.sort((a, b) => b.match_score - a.match_score);
    if (candidates.length) {
      await sb.from("product_supplier_candidates").upsert(candidates, {
        onConflict: "product_id,supplier,supplier_product_id",
      });
    }
    return jsonResponse({ ok: true, found: candidates.length, top: candidates.slice(0, 3) });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
});