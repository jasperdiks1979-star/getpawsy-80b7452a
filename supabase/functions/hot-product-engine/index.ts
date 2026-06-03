import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-source",
};

// Hot Product Engine
// - Integrates: growth_product_scores + orders + pinterest_pin_performance
// - Produces an integrated Hot Score (0-100) per active product
// - Auto-promotes any product scoring >=85 by feeding:
//     * ai_priority_queue (Revenue Command Center)
//     * pinterest_autopilot_overrides (force_promote)
//     * cinematic-ad-autopilot (V8 cinematic commercial render)
//     * pinterest-creative-director (creative regeneration)

const PROMOTE_THRESHOLD = 85;
const AGGRESSIVE_THRESHOLD = 90;
const DOMINATION_THRESHOLD = 95;
const WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

type ProductRow = {
  id: string;
  name: string;
  slug: string | null;
  price: number | null;
  cost_price: number | null;
  category: string | null;
  is_active: boolean | null;
};

function safeNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const today = new Date().toISOString().slice(0, 10);
    const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();

    // 1. Pull active products
    const { data: products, error: pErr } = await sb
      .from("products")
      .select("id,name,slug,price,cost_price,category,is_active")
      .eq("is_active", true)
      .eq("is_duplicate", false)
      .limit(2000);
    if (pErr) throw pErr;

    // 2. Pull growth scores (today) for opportunity baseline
    const { data: growth } = await sb
      .from("growth_product_scores")
      .select("product_id,opportunity_score,confidence_score,recommended_hook,recommended_angle")
      .eq("day", today);
    const growthByProduct = new Map<string, { opp: number; conf: number; hook?: string; angle?: string }>();
    for (const g of growth ?? []) {
      growthByProduct.set((g as any).product_id, {
        opp: safeNum((g as any).opportunity_score),
        conf: safeNum((g as any).confidence_score),
        hook: (g as any).recommended_hook,
        angle: (g as any).recommended_angle,
      });
    }

    // 3. Pull Pinterest performance (30d) aggregated by product
    const { data: perf } = await sb
      .from("pinterest_pin_performance")
      .select("product_id,impressions,clicks,saves")
      .gte("created_at", since30)
      .limit(10000);
    const perfByProduct = new Map<string, { imp: number; clk: number; sav: number }>();
    for (const r of perf ?? []) {
      const id = (r as any).product_id as string | null;
      if (!id) continue;
      const cur = perfByProduct.get(id) ?? { imp: 0, clk: 0, sav: 0 };
      cur.imp += safeNum((r as any).impressions);
      cur.clk += safeNum((r as any).clicks);
      cur.sav += safeNum((r as any).saves);
      perfByProduct.set(id, cur);
    }

    // 4. Aggregate revenue/profit from paid orders (30d)
    const PAID = ["paid", "fulfilled", "shipped", "delivered", "completed"];
    const { data: orders } = await sb
      .from("orders")
      .select("items,created_at,status")
      .gte("created_at", since30)
      .in("status", PAID)
      .limit(5000);
    const revByProduct = new Map<string, { rev: number; units: number }>();
    for (const o of orders ?? []) {
      const items = (o as any).items;
      if (!Array.isArray(items)) continue;
      for (const it of items) {
        const pid = it?.product_id ?? it?.id;
        if (!pid) continue;
        const price = safeNum(it?.price);
        const qty = safeNum(it?.quantity ?? 1);
        const cur = revByProduct.get(pid) ?? { rev: 0, units: 0 };
        cur.rev += price * qty;
        cur.units += qty;
        revByProduct.set(pid, cur);
      }
    }

    const upserts: any[] = [];
    const winners: { id: string; score: number; signals: any }[] = [];

    for (const p of (products ?? []) as ProductRow[]) {
      const g = growthByProduct.get(p.id);
      const pf = perfByProduct.get(p.id) ?? { imp: 0, clk: 0, sav: 0 };
      const rv = revByProduct.get(p.id) ?? { rev: 0, units: 0 };

      // Margin (0-25)
      let marginScore = 12;
      if (p.price && p.cost_price && p.price > 0) {
        const m = (p.price - p.cost_price) / p.price;
        if (m >= 0.65) marginScore = 25;
        else if (m >= 0.5) marginScore = 20;
        else if (m >= 0.35) marginScore = 14;
        else if (m >= 0.2) marginScore = 8;
        else marginScore = 3;
      }
      const profit30 = p.price && p.cost_price
        ? Math.max(0, (p.price - p.cost_price) * rv.units)
        : rv.rev * 0.4;

      // Intent (0-25): purchases + revenue velocity
      const intentScore = Math.min(25,
        Math.round(rv.units * 2.2 + Math.log10(1 + rv.rev) * 4),
      );

      // Viral (0-25): Pinterest saves & CTR
      const ctr = pf.imp > 0 ? pf.clk / pf.imp : 0;
      const viralScore = Math.min(25,
        Math.round(Math.log10(1 + pf.sav) * 6 + ctr * 300 + Math.log10(1 + pf.imp) * 2),
      );

      // Pinterest fit (0-25): from growth opportunity baseline scaled
      const pinFit = Math.min(25, Math.round((g?.opp ?? 50) * 0.25));

      const hot = Math.max(0, Math.min(100, marginScore + intentScore + viralScore + pinFit));

      const recommended =
        hot >= DOMINATION_THRESHOLD ? "domination_mode"
        : hot >= AGGRESSIVE_THRESHOLD ? "aggressive_promote_v9"
        : hot >= PROMOTE_THRESHOLD ? "auto_promote_v9"
        : hot >= 70 ? "boost_pinterest"
        : hot >= 50 ? "monitor"
        : "deprioritize";

      const promotionTier =
        hot >= DOMINATION_THRESHOLD ? "domination"
        : hot >= AGGRESSIVE_THRESHOLD ? "aggressive"
        : hot >= PROMOTE_THRESHOLD ? "candidate"
        : "none";

      const row = {
        product_id: p.id,
        day: today,
        hot_score: hot,
        intent_score: intentScore,
        viral_score: viralScore,
        margin_score: marginScore,
        pinterest_fit_score: pinFit,
        revenue_30d: rv.rev,
        profit_30d: profit30,
        units_30d: rv.units,
        pinterest_impressions_30d: pf.imp,
        pinterest_clicks_30d: pf.clk,
        pinterest_saves_30d: pf.sav,
        recommended_action: recommended,
        signals: { name: p.name, slug: p.slug, category: p.category, hook: g?.hook, angle: g?.angle, ctr },
      };
      (row as any).signals.promotion_tier = promotionTier;
      upserts.push(row);
      if (hot >= PROMOTE_THRESHOLD) winners.push({ id: p.id, score: hot, signals: row });
      // attach slug for downstream V8 invocation
      (winners[winners.length - 1] as any) && ((winners[winners.length - 1] as any).slug = p.slug);
    }

    // Batch upsert
    for (let i = 0; i < upserts.length; i += 500) {
      const chunk = upserts.slice(i, i + 500);
      const { error: uErr } = await sb.from("hot_product_scores")
        .upsert(chunk, { onConflict: "product_id,day" });
      if (uErr) throw uErr;
    }

    // 5. Auto-promote winners — fan out into the integrated growth engine
    let promoted = 0;
    const promotionResults: any[] = [];
    for (const w of winners.slice(0, 20)) { // cap per run
      const promo: any = { product_id: w.id, score: w.score, actions: [] };
      try {
        // a) Revenue Command Center signal
        await sb.from("ai_priority_queue").upsert({
          source_kind: "hot_product",
          source_ref: w.id,
          category: "growth_promotion",
          title: `Hot product: ${w.signals.signals?.name ?? w.id} (${w.score})`,
          summary: `Auto-promoted to Pinterest Autopilot + V8 Cinematic. Hot Score ${w.score}/100.`,
          recommended_action: "auto_promote_v8",
          expected_revenue_impact: Math.round(w.signals.revenue_30d * 1.5),
          confidence: Math.min(100, 60 + w.score / 5),
          priority_score: w.score,
          status: "open",
          dedupe_key: `hot_product:${w.id}:${today}`,
          evidence: w.signals,
        }, { onConflict: "dedupe_key" });
        promo.actions.push("priority_queue");

        // b) Pinterest Autopilot force-promote
        await sb.from("pinterest_autopilot_overrides").upsert({
          product_id: w.id,
          action: "force_promote",
          reason: `Hot Score ${w.score} — auto-promoted by Hot Product Engine`,
          expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
        }, { onConflict: "product_id" });
        promo.actions.push("autopilot_force_promote");

        // c) Trigger V8 cinematic commercial render (fire-and-forget)
        try {
          const slug = (w as any).slug ?? w.signals.signals?.slug;
          if (slug) {
            const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/cinematic-ad-autopilot`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-internal-token": WORKER_SECRET,
                "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "",
              },
              body: JSON.stringify({
                product_slug: slug,
                source: "hot_product_engine",
                autopilot_threshold:
                  w.score >= DOMINATION_THRESHOLD ? 95
                  : w.score >= AGGRESSIVE_THRESHOLD ? 90
                  : 85,
                promotion_tier:
                  w.score >= DOMINATION_THRESHOLD ? "domination"
                  : w.score >= AGGRESSIVE_THRESHOLD ? "aggressive"
                  : "candidate",
                v9_strict: true,
              }),
            });
            promo.actions.push(res.ok ? "cinematic_v8" : `cinematic_v8_http_${res.status}`);
          } else {
            promo.cinematic_error = "missing slug";
          }
        } catch (e) {
          promo.cinematic_error = e instanceof Error ? e.message : String(e);
        }

        // d) Trigger Pinterest Creative Director
        try {
          await sb.functions.invoke("pinterest-creative-director", {
            body: { product_id: w.id, source: "hot_product_engine", drafts_only: false },
          });
          promo.actions.push("creative_director");
        } catch (e) {
          promo.creative_error = e instanceof Error ? e.message : String(e);
        }

        // Mark scored row
        await sb.from("hot_product_scores")
          .update({ auto_promoted: true, promotion_log: promo, updated_at: new Date().toISOString() })
          .eq("product_id", w.id).eq("day", today);
        promoted++;
      } catch (e) {
        promo.error = e instanceof Error ? e.message : String(e);
      }
      promotionResults.push(promo);
    }

    return new Response(JSON.stringify({
      ok: true,
      traceId,
      scored: upserts.length,
      winners: winners.length,
      promoted,
      promotionResults,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, traceId, message: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  }
});