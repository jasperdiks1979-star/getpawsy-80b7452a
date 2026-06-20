import {
  sbAdmin, jsonResponse, RECOVERY_CORS, cjToken, searchCjCatalog,
  fetchGlobalInventory, titleSimilarity,
} from "../_shared/recovery-engine.ts";

// Finds a ≥90% functional replacement when the original SKU is globally gone.
// Writes top match to product_replacement_candidates (admin-gated promotion).
// POST { productId }
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: RECOVERY_CORS });
  try {
    const { productId } = await req.json().catch(() => ({}));
    if (!productId) return jsonResponse({ ok: false, error: "productId required" }, 400);
    const sb = sbAdmin();
    const { data: product } = await sb
      .from("products")
      .select("id, name, price, category, niche, effective_stock")
      .eq("id", productId)
      .maybeSingle();
    if (!product) return jsonResponse({ ok: false, error: "product not found" }, 404);

    // Internal first — cheaper, already vetted.
    const { data: internal } = await sb
      .from("products")
      .select("id, name, price, effective_stock, category")
      .eq("category", product.category)
      .gt("effective_stock", 0)
      .neq("id", productId)
      .limit(50);
    let bestInternal: any = null;
    for (const c of (internal ?? []) as any[]) {
      const sim = titleSimilarity(product.name ?? "", c.name ?? "");
      const priceFit = c.price > 0 && product.price > 0
        ? Math.max(0, 1 - Math.abs(c.price - product.price) / Math.max(c.price, product.price)) : 0.3;
      const score = sim * 0.7 + priceFit * 0.3;
      if (!bestInternal || score > bestInternal.score) bestInternal = { ...c, score };
    }

    // CJ search fallback.
    const token = await cjToken(sb);
    const kw = (product.name ?? "").split(/\s+/).filter((w: string) => w.length > 3).slice(0, 3).join(" ");
    const cjList = kw ? await searchCjCatalog(token, kw, 15) : [];
    let bestCj: any = null;
    for (const c of cjList) {
      const title = String(c.productNameEn ?? c.productName ?? "");
      const sim = titleSimilarity(product.name ?? "", title);
      if (sim < 0.4) continue;
      const pid = String(c.pid ?? "");
      const inv = await fetchGlobalInventory(token, pid).catch(() => ({ warehouses: [] }));
      const qty = inv.warehouses.reduce((s, w) => s + w.qty, 0);
      if (!qty) continue;
      const priceFit = product.price > 0 && Number(c.sellPrice) > 0
        ? Math.max(0, 1 - Math.abs(Number(c.sellPrice) - product.price) / Math.max(Number(c.sellPrice), product.price)) : 0.3;
      const score = sim * 0.6 + priceFit * 0.25 + Math.min(0.15, qty / 1000);
      if (!bestCj || score > bestCj.score) bestCj = { pid, title, sellPrice: Number(c.sellPrice), qty, score, image: c.productImage };
    }

    const top = (bestInternal?.score ?? 0) >= (bestCj?.score ?? 0) ? { kind: "internal", ...bestInternal } : { kind: "cj", ...bestCj };
    if (!top || !top.score) return jsonResponse({ ok: true, found: false });
    const matchPct = Number((top.score * 100).toFixed(1));

    await sb.from("product_replacement_candidates").upsert({
      product_id: productId,
      candidate_kind: top.kind,
      candidate_ref: top.kind === "internal" ? top.id : top.pid,
      match_score: matchPct,
      details: top,
      status: matchPct >= 90 ? "ready_for_review" : "below_threshold",
      created_at: new Date().toISOString(),
    } as any, { onConflict: "product_id,candidate_ref" }).then(() => {}).catch(() => {});

    return jsonResponse({ ok: true, found: true, matchPct, top });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
});