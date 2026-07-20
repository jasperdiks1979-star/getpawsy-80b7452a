// Pinterest Psychology Engine — admin orchestration & introspection.
// snapshot   : dashboard rollup
// simulate   : preview story profile + attention map for a product
// analyze    : cache a story profile in DB
// score      : score an existing creative concept on demand
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  buildStoryProfile,
  pickRotatingBadge,
  rewriteSupplierTitle,
  buildAttentionMap,
  predictCandidate,
  compositePpeScore,
  ppeFloors,
} from "../_shared/ppe-engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function snapshot(sb: any) {
  const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [cfg, scores24, scores7, winners, badges, badgeUsage, recentCreatives] = await Promise.all([
    sb.from("pcie_v2_config").select("key,value"),
    sb.from("ppe_candidate_scores").select("*").gte("created_at", since24),
    sb.from("ppe_candidate_scores").select("composite,ctr_prediction,product_visibility,scroll_stop,winner,competitor_verdict,created_at").gte("created_at", since7),
    sb.from("ppe_candidate_scores").select("creative_id,product_slug,composite,story,primary_emotion,badge_text,competitor_verdict,created_at").eq("winner", true).order("created_at", { ascending: false }).limit(12),
    sb.from("ppe_brand_badges").select("id,text,enabled"),
    sb.from("ppe_badge_usage").select("badge_id,used_at").gte("used_at", since7),
    sb.from("pcie_v2_creatives").select("id,product_slug,status,ppe_composite,ppe_winner,reject_reason,created_at,image_url,ppe_payload").gte("created_at", since24).order("created_at", { ascending: false }).limit(40),
  ]);

  const cfgMap = Object.fromEntries((cfg.data ?? []).map((r: any) => [r.key, r.value]));
  const floors = ppeFloors(cfgMap);
  const arr7 = scores7.data ?? [];
  const arr24 = scores24.data ?? [];
  const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

  const badgeMap = new Map((badges.data ?? []).map((b: any) => [b.id, b.text]));
  const usageCounts = new Map<string, number>();
  for (const u of badgeUsage.data ?? []) usageCounts.set(u.badge_id, (usageCounts.get(u.badge_id) ?? 0) + 1);
  const badgeStats = Array.from(usageCounts.entries())
    .map(([id, n]) => ({ text: badgeMap.get(id) ?? id, count: n }))
    .sort((a, b) => b.count - a.count).slice(0, 10);

  const rejections: Record<string, number> = {};
  for (const c of recentCreatives.data ?? []) {
    if (c.reject_reason) rejections[c.reject_reason] = (rejections[c.reject_reason] ?? 0) + 1;
  }

  return {
    floors,
    sample_24h: arr24.length,
    sample_7d: arr7.length,
    avg_composite_24h: avg(arr24.map((r: any) => Number(r.composite ?? 0)).filter(Boolean)),
    avg_composite_7d: avg(arr7.map((r: any) => Number(r.composite ?? 0)).filter(Boolean)),
    avg_ctr_24h: avg(arr24.map((r: any) => Number(r.ctr_prediction ?? 0)).filter(Boolean)),
    avg_visibility_24h: avg(arr24.map((r: any) => Number(r.product_visibility ?? 0)).filter(Boolean)),
    avg_scroll_stop_24h: avg(arr24.map((r: any) => Number(r.scroll_stop ?? 0)).filter(Boolean)),
    competitor_wins_24h: arr24.filter((r: any) => r.competitor_verdict === "wins").length,
    competitor_loses_24h: arr24.filter((r: any) => r.competitor_verdict === "loses").length,
    winners_recent: winners.data ?? [],
    badge_usage_top: badgeStats,
    rejection_reasons: Object.entries(rejections).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    recent_creatives: recentCreatives.data ?? [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? (req.method === "POST" ? (await req.clone().json().catch(() => ({}))).action : "snapshot") ?? "snapshot";
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    if (action === "snapshot") {
      return json(200, { ok: true, ppe: await snapshot(sb) });
    }

    if (action === "simulate") {
      const title = String(body.title ?? body.product_slug ?? "");
      const niche = String(body.niche ?? "");
      const profile = buildStoryProfile({ title, niche, slug: body.product_slug });
      const badge = await pickRotatingBadge(sb).catch(() => null);
      const rewritten = rewriteSupplierTitle(title, niche);
      const map = buildAttentionMap({ hookLen: 28, productHero: true, hasBadge: !!badge, hasCta: true });
      return json(200, { ok: true, profile, badge, title_rewrite: { before: title, after: rewritten }, attention_map: map });
    }

    if (action === "analyze") {
      const niche = String(body.niche ?? "generic_pet");
      const slug = body.product_slug ?? null;
      const profile = buildStoryProfile({ niche, slug, title: body.title });
      const { error } = await sb.from("ppe_story_profiles").upsert({
        niche, product_slug: slug,
        story: profile.story, primary_emotion: profile.primary_emotion,
        secondary_emotion: profile.secondary_emotion, desired_response: profile.desired_response,
        buying_motivations: profile.buying_motivations, target_customer: profile.target_customer,
        scene_suggestions: profile.scene_suggestions, source: "heuristic",
      }, { onConflict: "niche,product_slug" });
      if (error) return json(500, { ok: false, error: error.message });
      return json(200, { ok: true, profile });
    }

    if (action === "score") {
      const r = await predictCandidate({
        product: { title: body.title ?? "", niche: body.niche ?? "generic_pet", slug: body.product_slug },
        decisions: body.decisions ?? {},
        story: body.story ?? "",
        primary_emotion: body.primary_emotion ?? "",
        hook: body.hook ?? "",
        cta: body.cta ?? "Shop Now",
        badge: body.badge ?? null,
        prompt: body.prompt ?? "",
      });
      const composite = compositePpeScore(r.scores);
      return json(200, { ok: true, predict: r, composite });
    }

    return json(400, { ok: false, error: `unknown_action:${action}` });
  } catch (e) {
    return json(500, { ok: false, error: String(e) });
  }
});