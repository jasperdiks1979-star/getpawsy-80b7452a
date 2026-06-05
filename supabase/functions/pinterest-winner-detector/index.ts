import "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_IMPRESSIONS = 1000;
const SAVE_RATE_FLOOR = 0.005;
const TOP_N = 10;
const REGEN_COUNT = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Aggregate last 14d per pin
    const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const { data: ad } = await sb
      .from("pinterest_analytics_daily")
      .select("pin_id,impressions,outbound_clicks,saves")
      .gte("day", since)
      .limit(20000);
    const agg = new Map<string, { imp: number; out: number; sav: number }>();
    for (const r of (ad ?? []) as { pin_id: string; impressions: number; outbound_clicks: number; saves: number }[]) {
      const a = agg.get(r.pin_id) ?? { imp: 0, out: 0, sav: 0 };
      a.imp += r.impressions; a.out += r.outbound_clicks; a.sav += r.saves;
      agg.set(r.pin_id, a);
    }

    const { data: dims } = await sb.from("pinterest_pin_dimensions").select("pin_id,category_key,asset_id,product_slug,hook_variant");
    const dimMap = new Map<string, { category_key: string | null; asset_id: string | null; product_slug: string | null; hook_variant: string | null }>();
    for (const d of (dims ?? []) as Array<Record<string, string | null>>) {
      dimMap.set(d.pin_id as string, { category_key: d.category_key, asset_id: d.asset_id, product_slug: d.product_slug, hook_variant: d.hook_variant });
    }

    const { data: bench } = await sb.from("pinterest_category_benchmarks").select("category_key,avg_ctr,avg_save_rate").eq("window_days", 14);
    const bm = new Map<string, { ctr: number; save: number }>();
    for (const b of (bench ?? []) as { category_key: string; avg_ctr: number; avg_save_rate: number }[]) {
      bm.set(b.category_key, { ctr: Number(b.avg_ctr), save: Number(b.avg_save_rate) });
    }

    const verdicts: Array<Record<string, unknown>> = [];
    let winners = 0, losers = 0;
    for (const [pin_id, a] of agg) {
      if (a.imp < MIN_IMPRESSIONS) continue;
      const ctr = a.out / a.imp;
      const saveRate = a.sav / a.imp;
      const d = dimMap.get(pin_id);
      const cat = d?.category_key ?? "unknown";
      const b = bm.get(cat) ?? { ctr: 0.005, save: 0.003 };
      let verdict: "winner" | "loser" | "neutral" = "neutral";
      let reason = "";
      let score = 0;
      if (ctr >= b.ctr * 1.2 && saveRate >= Math.max(b.save, SAVE_RATE_FLOOR)) {
        verdict = "winner"; winners++;
        reason = `CTR ${(ctr*100).toFixed(2)}% > cat avg ${(b.ctr*100).toFixed(2)}%; saves ok`;
        score = (ctr / Math.max(b.ctr, 0.0001)) + (saveRate / Math.max(b.save, 0.0001));
      } else if (ctr < b.ctr * 0.5 && saveRate < b.save * 0.5) {
        verdict = "loser"; losers++;
        reason = `CTR ${(ctr*100).toFixed(2)}% far below cat avg`;
      }
      verdicts.push({ pin_id, verdict, reason, impressions: a.imp, ctr, saves: a.sav, winner_score: score });

      if (verdict === "winner" && d?.asset_id) {
        await sb.from("pinterest_video_queue")
          .update({ priority: 90, winner_score: score })
          .eq("asset_id", d.asset_id);
      }
      if (verdict === "loser" && d?.asset_id) {
        await sb.from("pinterest_video_queue")
          .update({ archived: true, priority: 10 })
          .eq("asset_id", d.asset_id);
        await sb.from("pinterest_loser_blocklist").insert({
          asset_id: d.asset_id,
          product_slug: d.product_slug,
          hook_variant: d.hook_variant,
          reason,
          blocked_until: new Date(Date.now() + 30 * 86400000).toISOString(),
        });
      }
    }
    if (verdicts.length) await sb.from("pinterest_pin_verdicts").insert(verdicts);

    // ---- Top-10 winners / losers ranking (composite ranking) ----
    const scored = [...agg.entries()]
      .filter(([, a]) => a.imp >= MIN_IMPRESSIONS)
      .map(([pin_id, a]) => {
        const d = dimMap.get(pin_id);
        const cat = d?.category_key ?? "unknown";
        const b = bm.get(cat) ?? { ctr: 0.005, save: 0.003 };
        const ctr = a.out / a.imp;
        const saveRate = a.sav / a.imp;
        // Composite: impressions weight + saves + outbound + CTR ratio
        const score =
          Math.log10(a.imp + 1) * 1.0 +
          (ctr / Math.max(b.ctr, 0.0001)) * 2.0 +
          (saveRate / Math.max(b.save, 0.0001)) * 1.5 +
          Math.log10(a.out + 1) * 1.2;
        return { pin_id, ...a, ctr, saveRate, score, product_slug: d?.product_slug ?? null, asset_id: d?.asset_id ?? null };
      });
    const top10 = [...scored].sort((a, b) => b.score - a.score).slice(0, TOP_N);
    const bottom10 = [...scored].sort((a, b) => a.score - b.score).slice(0, TOP_N);

    // ---- Auto-generate new pins for winners (unique product slugs) ----
    const winnerSlugs = [...new Set(top10.map((w) => w.product_slug).filter(Boolean))] as string[];
    const regenResults: Array<{ slug: string; ok: boolean; error?: string }> = [];
    for (const slug of winnerSlugs) {
      try {
        const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/pinterest-creative-director`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ action: "run_full", productSlug: slug, count: REGEN_COUNT }),
        });
        regenResults.push({ slug, ok: r.ok, error: r.ok ? undefined : `HTTP ${r.status}` });
      } catch (e) {
        regenResults.push({ slug, ok: false, error: (e as Error).message });
      }
    }

    // ---- Auto-block losers by product_slug (stop generating for these) ----
    const loserSlugs = [...new Set(bottom10.map((l) => l.product_slug).filter(Boolean))] as string[];
    for (const slug of loserSlugs) {
      await sb.from("pinterest_loser_blocklist").insert({
        product_slug: slug,
        reason: "Top-10 loser (24h detector)",
        blocked_until: new Date(Date.now() + 30 * 86400000).toISOString(),
      });
    }

    return new Response(JSON.stringify({
      ok: true, traceId, scored: verdicts.length, winners, losers,
      top10: top10.map(({ pin_id, imp, out, sav, ctr, saveRate, score, product_slug }) => ({
        pin_id, impressions: imp, outbound_clicks: out, saves: sav, ctr, saveRate, score, product_slug,
      })),
      bottom10: bottom10.map(({ pin_id, imp, out, sav, ctr, saveRate, score, product_slug }) => ({
        pin_id, impressions: imp, outbound_clicks: out, saves: sav, ctr, saveRate, score, product_slug,
      })),
      regenerated: regenResults,
      blockedProductSlugs: loserSlugs,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (e as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});