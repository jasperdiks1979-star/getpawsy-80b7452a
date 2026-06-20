import { sbAdmin, jsonResponse, RECOVERY_CORS } from "../_shared/recovery-engine.ts";

// Refreshes the winner_products table. Top 100 globally + top 25 per niche
// are marked is_protected=true. Score blends revenue, outbound CTR, saves,
// media quality, and pin conversion data.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: RECOVERY_CORS });
  try {
    const sb = sbAdmin();
    // Pull revenue scores, pin perf, and product meta.
    const [{ data: scores }, { data: perf }, { data: products }] = await Promise.all([
      sb.from("revenue_ai_revenue_scores").select("product_id, composite, sales_score, ctr_score, media_score"),
      sb.from("revenue_ai_pin_performance").select("product_id, outbound_clicks, saves, purchases, revenue_cents, impressions").limit(200000),
      sb.from("products").select("id, name, category, niche, slug, effective_stock"),
    ]);

    const perfByProd = new Map<string, { clicks: number; saves: number; purchases: number; revenue: number; imp: number }>();
    for (const p of (perf ?? []) as any[]) {
      if (!p.product_id) continue;
      const c = perfByProd.get(p.product_id) ?? { clicks: 0, saves: 0, purchases: 0, revenue: 0, imp: 0 };
      c.clicks += Number(p.outbound_clicks || 0);
      c.saves += Number(p.saves || 0);
      c.purchases += Number(p.purchases || 0);
      c.revenue += Number(p.revenue_cents || 0);
      c.imp += Number(p.impressions || 0);
      perfByProd.set(p.product_id, c);
    }
    const scoresByProd = new Map((scores ?? []).map((s: any) => [s.product_id, s]));

    const rows = (products ?? []).map((p: any) => {
      const perfRow = perfByProd.get(p.id) ?? { clicks: 0, saves: 0, purchases: 0, revenue: 0, imp: 0 };
      const s = scoresByProd.get(p.id) ?? {};
      const ctr = perfRow.imp > 0 ? perfRow.clicks / perfRow.imp : 0;
      const score =
        0.35 * Math.min(1, perfRow.revenue / 50000) +     // $500 caps to 1
        0.20 * Math.min(1, ctr * 50) +                    // 2% CTR caps to 1
        0.15 * Math.min(1, perfRow.saves / 500) +
        0.15 * (Number((s as any).media_score ?? 0) / 100) +
        0.15 * Math.min(1, perfRow.purchases / 20);
      return {
        product_id: p.id,
        score: Number((score * 100).toFixed(2)),
        niche: p.niche ?? p.category ?? null,
        signals: { ctr, ...perfRow, composite: (s as any).composite ?? null },
      };
    });

    // Pick top 100 global + top 25 per niche.
    const sorted = [...rows].sort((a, b) => b.score - a.score);
    const protectedIds = new Set(sorted.slice(0, 100).map((r) => r.product_id));
    const byNiche = new Map<string, typeof rows>();
    for (const r of sorted) {
      const key = r.niche ?? "_";
      const arr = byNiche.get(key) ?? [];
      if (arr.length < 25) arr.push(r);
      byNiche.set(key, arr);
    }
    for (const arr of byNiche.values()) for (const r of arr) protectedIds.add(r.product_id);

    const upserts = rows
      .filter((r) => r.score > 0)
      .map((r) => ({
        product_id: r.product_id,
        score: r.score,
        niche: r.niche,
        signals: r.signals,
        is_protected: protectedIds.has(r.product_id),
        refreshed_at: new Date().toISOString(),
      }));
    for (let i = 0; i < upserts.length; i += 500) {
      await sb.from("winner_products").upsert(upserts.slice(i, i + 500), { onConflict: "product_id" });
    }
    return jsonResponse({ ok: true, scored: upserts.length, protected: protectedIds.size });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
});