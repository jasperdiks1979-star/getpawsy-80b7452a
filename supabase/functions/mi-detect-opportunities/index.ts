import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Trend = {
  id: string;
  term: string;
  trend_type: string | null;
  category: string | null;
  score: number | null;
  momentum: number | null;
};
type Product = {
  id: string;
  title: string | null;
  slug: string | null;
  category: string | null;
  active: boolean | null;
};
type Observation = {
  id: string;
  hook: string | null;
  cta: string | null;
  format: string | null;
  category: string | null;
  engagement_score: number | null;
};

function norm(s: string | null | undefined): string {
  return (s || "").toLowerCase().trim();
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = crypto.randomUUID();
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) Pull active US trends (rising/engagement)
    const { data: trends, error: tErr } = await sb
      .from("mi_trends")
      .select("id, term, trend_type, category, score, momentum")
      .eq("market", "US")
      .order("score", { ascending: false })
      .limit(200);
    if (tErr) throw tErr;

    // 2) Catalog snapshot (active products only)
    const { data: products, error: pErr } = await sb
      .from("products")
      .select("id, title, slug, category, active")
      .eq("active", true)
      .limit(2000);
    if (pErr) throw pErr;

    // 3) Recent competitor observations
    const { data: obs, error: oErr } = await sb
      .from("mi_competitor_observations")
      .select("id, hook, cta, format, category, engagement_score")
      .order("created_at", { ascending: false })
      .limit(500);
    if (oErr) throw oErr;

    const productIndex = (products ?? []) as Product[];
    const observations = (obs ?? []) as Observation[];

    let oppsInserted = 0;
    let recsInserted = 0;

    const opportunities: Array<{
      type: string; title: string; market: string; score: number;
      evidence: Record<string, unknown>; status: string;
    }> = [];
    const recommendations: Array<{
      title: string; body: string; category: string | null;
      market: string; confidence: number; status: string;
    }> = [];

    // --- A) Trend × catalog: rising trends WITH matching product = "low_comp_topic"
    //     Trends WITHOUT matching product = "niche_gap" (real gap)
    for (const t of (trends ?? []) as Trend[]) {
      const term = norm(t.term);
      if (!term) continue;
      const score = Number(t.score ?? 0);
      const momentum = Number(t.momentum ?? 0);
      if (score < 10 && momentum < 5) continue;

      const matches = productIndex.filter((p) => {
        const hay = `${norm(p.title)} ${norm(p.slug)} ${norm(p.category)}`;
        return hay.includes(term);
      });

      if (matches.length === 0) {
        opportunities.push({
          type: "niche_gap",
          title: `Catalog gap: "${t.term}" (no matching product)`,
          market: "US",
          score: clamp(Math.round(score * 0.8 + momentum * 2)),
          evidence: {
            trend_id: t.id, term: t.term, trend_score: score,
            momentum, category: t.category, source: "trend_catalog_join",
          },
          status: "open",
        });

        recommendations.push({
          title: `Source or feature a product for "${t.term}"`,
          body: `Trend "${t.term}" is rising in the US (score ${score.toFixed(0)}, momentum ${momentum.toFixed(0)}) but no matching active product was found in the catalog. Consider sourcing or surfacing one in collections + Pinterest queue.`,
          category: t.category || "catalog",
          market: "US",
          confidence: clamp(Math.round(50 + momentum * 2)),
          status: "new",
        });
      } else if (matches.length <= 3) {
        opportunities.push({
          type: "low_comp_topic",
          title: `Underexposed product set for "${t.term}" (${matches.length} match)`,
          market: "US",
          score: clamp(Math.round(score * 0.6 + momentum * 1.5)),
          evidence: {
            trend_id: t.id, term: t.term, trend_score: score, momentum,
            product_ids: matches.slice(0, 5).map((m) => m.id),
            source: "trend_catalog_join",
          },
          status: "open",
        });

        const topProduct = matches[0];
        recommendations.push({
          title: `Boost Pinterest creatives for "${topProduct.title}"`,
          body: `Trend "${t.term}" has rising US demand but only ${matches.length} matching product(s). Generate 3–5 fresh Pinterest pin drafts from a viral recipe and push into the queue.`,
          category: "pinterest",
          market: "US",
          confidence: clamp(Math.round(45 + score * 0.4)),
          status: "new",
        });
      }
    }

    // --- B) High-engagement observation hooks not yet used in a recipe → "viral_hook"
    const hookCounts = new Map<string, { count: number; engagement: number; format: string | null }>();
    for (const o of observations) {
      const h = norm(o.hook);
      if (!h || h.length < 4) continue;
      const cur = hookCounts.get(h) ?? { count: 0, engagement: 0, format: o.format };
      cur.count += 1;
      cur.engagement += Number(o.engagement_score ?? 0);
      hookCounts.set(h, cur);
    }

    const hookLeaders = [...hookCounts.entries()]
      .filter(([, v]) => v.count >= 2 || v.engagement >= 60)
      .sort((a, b) => b[1].engagement - a[1].engagement)
      .slice(0, 15);

    for (const [hook, v] of hookLeaders) {
      opportunities.push({
        type: "viral_hook",
        title: `Repeating viral hook: "${hook.slice(0, 80)}"`,
        market: "US",
        score: clamp(Math.round(v.engagement / Math.max(1, v.count) + v.count * 5)),
        evidence: {
          hook, occurrences: v.count, total_engagement: v.engagement,
          format: v.format, source: "observation_hook_aggregate",
        },
        status: "open",
      });

      recommendations.push({
        title: `Adapt hook angle: "${hook.slice(0, 60)}…"`,
        body: `Multiple US competitor pins/videos use the angle "${hook}" with strong engagement. Create an original GetPawsy pin/video that reframes the same emotional angle (DO NOT copy text or visuals).`,
        category: v.format || "creative",
        market: "US",
        confidence: clamp(50 + v.count * 5),
        status: "new",
      });
    }

    // --- C) Insert (idempotent-ish: dedupe by title within 7d)
    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentOpps } = await sb
      .from("mi_opportunities").select("title")
      .eq("market", "US").gte("created_at", since7);
    const seenOpp = new Set((recentOpps ?? []).map((r) => r.title));

    const oppPayload = opportunities.filter((o) => !seenOpp.has(o.title));
    if (oppPayload.length > 0) {
      const { error: oiErr } = await sb.from("mi_opportunities").insert(oppPayload);
      if (oiErr) throw oiErr;
      oppsInserted = oppPayload.length;
    }

    const { data: recentRecs } = await sb
      .from("mi_recommendations").select("title")
      .eq("market", "US").gte("created_at", since7);
    const seenRec = new Set((recentRecs ?? []).map((r) => r.title));

    const recPayload = recommendations.filter((r) => !seenRec.has(r.title));
    if (recPayload.length > 0) {
      const { error: riErr } = await sb.from("mi_recommendations").insert(recPayload);
      if (riErr) throw riErr;
      recsInserted = recPayload.length;
    }

    return new Response(JSON.stringify({
      ok: true, traceId,
      stats: {
        trends_scanned: trends?.length ?? 0,
        products_scanned: productIndex.length,
        observations_scanned: observations.length,
        opportunities_inserted: oppsInserted,
        recommendations_inserted: recsInserted,
        hook_leaders: hookLeaders.length,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("mi-detect-opportunities error", e);
    return new Response(JSON.stringify({
      ok: false, traceId, message: e instanceof Error ? e.message : String(e),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});