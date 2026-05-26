import "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url = new URL(req.url);
    const panel = url.searchParams.get("panel") ?? "headline";
    const since7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const sincePrev = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);

    if (panel === "headline") {
      const { data: cur } = await sb.from("pinterest_analytics_daily").select("impressions,outbound_clicks,saves,ctr").gte("day", since7);
      const { data: prev } = await sb.from("pinterest_analytics_daily").select("impressions,outbound_clicks,saves").gte("day", sincePrev).lt("day", since7);
      const sum = (rows: { impressions: number; outbound_clicks: number; saves: number }[] | null) => (rows ?? []).reduce((a, r) => ({
        impressions: a.impressions + r.impressions, outbound_clicks: a.outbound_clicks + r.outbound_clicks, saves: a.saves + r.saves,
      }), { impressions: 0, outbound_clicks: 0, saves: 0 });
      const c = sum(cur as never), p = sum(prev as never);
      const ctr = c.impressions ? c.outbound_clicks / c.impressions : 0;
      const { count: winCount } = await sb.from("pinterest_pin_verdicts").select("id", { count: "exact", head: true }).eq("verdict", "winner").gte("scored_at", new Date(Date.now() - 7*86400000).toISOString());
      return json({ ok: true, traceId, current: c, previous: p, ctr, winners_7d: winCount ?? 0 });
    }
    if (panel === "categories") {
      const { data: ad } = await sb.from("pinterest_analytics_daily").select("pin_id,impressions,outbound_clicks,saves").gte("day", since7).limit(10000);
      const { data: dims } = await sb.from("pinterest_pin_dimensions").select("pin_id,category_key");
      const cat = new Map<string, string>();
      for (const d of (dims ?? []) as { pin_id: string; category_key: string | null }[]) if (d.category_key) cat.set(d.pin_id, d.category_key);
      const agg = new Map<string, { imp: number; out: number; sav: number; n: number }>();
      for (const r of (ad ?? []) as { pin_id: string; impressions: number; outbound_clicks: number; saves: number }[]) {
        const c = cat.get(r.pin_id) ?? "unknown";
        const a = agg.get(c) ?? { imp: 0, out: 0, sav: 0, n: 0 };
        a.imp += r.impressions; a.out += r.outbound_clicks; a.sav += r.saves; a.n++;
        agg.set(c, a);
      }
      const rows = [...agg.entries()].map(([category_key, a]) => ({
        category_key, impressions: a.imp, outbound_clicks: a.out, saves: a.sav,
        ctr: a.imp ? a.out / a.imp : 0, save_rate: a.imp ? a.sav / a.imp : 0, samples: a.n,
      })).sort((x, y) => y.impressions - x.impressions);
      return json({ ok: true, traceId, rows });
    }
    if (panel === "variants") {
      const { data: ad } = await sb.from("pinterest_analytics_daily").select("pin_id,impressions,outbound_clicks").gte("day", since7).limit(10000);
      const { data: dims } = await sb.from("pinterest_pin_dimensions").select("pin_id,hook_variant,copy_variant,cta_variant");
      const dm = new Map<string, { hook_variant: string | null; copy_variant: string | null; cta_variant: string | null }>();
      for (const d of (dims ?? []) as Array<Record<string, string | null>>) dm.set(d.pin_id as string, d as never);
      const agg = new Map<string, { imp: number; out: number; hook: string; copy: string; cta: string }>();
      for (const r of (ad ?? []) as { pin_id: string; impressions: number; outbound_clicks: number }[]) {
        const d = dm.get(r.pin_id); if (!d) continue;
        const k = `${d.hook_variant ?? "?"}|${d.copy_variant ?? "?"}|${d.cta_variant ?? "?"}`;
        const a = agg.get(k) ?? { imp: 0, out: 0, hook: d.hook_variant ?? "?", copy: d.copy_variant ?? "?", cta: d.cta_variant ?? "?" };
        a.imp += r.impressions; a.out += r.outbound_clicks;
        agg.set(k, a);
      }
      const rows = [...agg.values()].map(a => ({ ...a, ctr: a.imp ? a.out / a.imp : 0 })).sort((x, y) => y.ctr - x.ctr).slice(0, 30);
      return json({ ok: true, traceId, rows });
    }
    if (panel === "verdicts") {
      const { data } = await sb.from("pinterest_pin_verdicts").select("*").order("scored_at", { ascending: false }).limit(50);
      return json({ ok: true, traceId, rows: data ?? [] });
    }
    if (panel === "windows") {
      const { data } = await sb.from("pinterest_posting_windows").select("*").order("score", { ascending: false }).limit(200);
      return json({ ok: true, traceId, rows: data ?? [] });
    }
    if (panel === "trends") {
      const { data } = await sb.from("pinterest_trend_signals").select("*").gte("valid_to", new Date().toISOString()).order("strength", { ascending: false }).limit(50);
      return json({ ok: true, traceId, rows: data ?? [] });
    }
    if (panel === "revenue") {
      const { data: ev } = await sb.from("pinterest_funnel_events").select("event_name,value,pin_id,product_slug,occurred_at").gte("occurred_at", new Date(Date.now()-30*86400000).toISOString()).limit(5000);
      const purchases = (ev ?? []).filter((e: { event_name: string }) => e.event_name === "purchase");
      const revenue = purchases.reduce((a: number, e: { value: number | null }) => a + Number(e.value ?? 0), 0);
      return json({ ok: true, traceId, revenue, purchases: purchases.length, monthly_est: revenue });
    }
    return json({ ok: false, traceId, message: "unknown panel" });
  } catch (e) {
    return json({ ok: false, traceId, message: (e as Error).message });
  }
});
function json(b: unknown) { return new Response(JSON.stringify(b), { headers: { ...corsHeaders, "Content-Type": "application/json" } }); }