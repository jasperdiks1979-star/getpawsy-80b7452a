// Simple metrics endpoint for the 4 Ailurova launch pins.
// Combines Pinterest v5 pin analytics (impressions/saves/clicks/outbound)
// with on-site session clicks from canonical_sessions grouped by utm_content.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PIN_API = "https://api.pinterest.com/v5";

const PINS: Array<{ pin_id: string; utm_content: string; label: string; angle: string }> = [
  { pin_id: "1117103882603172344", utm_content: "pin_xl_large_cats", label: "Pin 1", angle: "XL / Large Cats" },
  { pin_id: "1117103882603172347", utm_content: "pin_easy_clean",   label: "Pin 2", angle: "Cleaner. Sleeker." },
  { pin_id: "1117103882603172349", utm_content: "pin_less_tracking",label: "Pin 3", angle: "Less Tracking" },
  { pin_id: "1117103882603172353", utm_content: "pin_premium_home", label: "Pin 4", angle: "Premium Home" },
];

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const url = new URL(req.url);
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "30", 10) || 30, 1), 90);
    const end = new Date();
    const start = new Date(Date.now() - days * 86400_000);
    const start_date = isoDate(start);
    const end_date = isoDate(end);

    // Pinterest token
    const { data: conn } = await sb
      .from("pinterest_connection")
      .select("access_token, account_name, status")
      .eq("status", "connected")
      .maybeSingle();
    const token = conn?.access_token as string | undefined;

    // Site sessions grouped by utm_content
    const utmContents = PINS.map((p) => p.utm_content);
    const { data: rows, error: sErr } = await sb
      .from("canonical_sessions")
      .select("utm_content, session_id, order_id, last_stage")
      .eq("utm_campaign", "ailurova_launch")
      .in("utm_content", utmContents)
      .gte("first_seen_at", start.toISOString());
    if (sErr) return json({ ok: false, step: "sessions", error: sErr.message }, 500);

    const siteByUtm = new Map<string, { sessions: number; orders: number; reached_checkout: number }>();
    for (const u of utmContents) siteByUtm.set(u, { sessions: 0, orders: 0, reached_checkout: 0 });
    for (const r of rows ?? []) {
      const b = siteByUtm.get((r as any).utm_content);
      if (!b) continue;
      b.sessions += 1;
      if ((r as any).order_id) b.orders += 1;
      const stage = String((r as any).last_stage ?? "");
      if (stage === "checkout" || stage === "purchase") b.reached_checkout += 1;
    }

    // Pinterest per-pin analytics
    const metric_types = "IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK";
    const pinResults = await Promise.all(PINS.map(async (p) => {
      let pin_metrics: Record<string, number> = { IMPRESSION: 0, SAVE: 0, PIN_CLICK: 0, OUTBOUND_CLICK: 0 };
      let pin_error: string | null = null;
      let daily: Array<{ date: string; IMPRESSION: number; SAVE: number; PIN_CLICK: number; OUTBOUND_CLICK: number; ctr: number }> = [];
      if (token) {
        const u = `${PIN_API}/pins/${p.pin_id}/analytics?start_date=${start_date}&end_date=${end_date}&metric_types=${metric_types}`;
        const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          pin_error = `pinterest_${r.status}: ${JSON.stringify(body).slice(0, 200)}`;
        } else {
          const all = body?.all?.summary_metrics ?? {};
          pin_metrics = {
            IMPRESSION: Number(all.IMPRESSION ?? 0),
            SAVE: Number(all.SAVE ?? 0),
            PIN_CLICK: Number(all.PIN_CLICK ?? 0),
            OUTBOUND_CLICK: Number(all.OUTBOUND_CLICK ?? 0),
          };
          const dm = body?.all?.daily_metrics ?? [];
          daily = (Array.isArray(dm) ? dm : []).map((d: any) => {
            const m = d?.metrics ?? {};
            const impr = Number(m.IMPRESSION ?? 0);
            const out = Number(m.OUTBOUND_CLICK ?? 0);
            return {
              date: String(d?.date ?? ""),
              IMPRESSION: impr,
              SAVE: Number(m.SAVE ?? 0),
              PIN_CLICK: Number(m.PIN_CLICK ?? 0),
              OUTBOUND_CLICK: out,
              ctr: impr > 0 ? out / impr : 0,
            };
          }).filter((d: any) => d.date);
        }
      } else {
        pin_error = "no_pinterest_connection";
      }
      const site = siteByUtm.get(p.utm_content) ?? { sessions: 0, orders: 0, reached_checkout: 0 };
      const ctr = pin_metrics.IMPRESSION > 0 ? pin_metrics.OUTBOUND_CLICK / pin_metrics.IMPRESSION : 0;
      const save_rate = pin_metrics.IMPRESSION > 0 ? pin_metrics.SAVE / pin_metrics.IMPRESSION : 0;
      return {
        ...p,
        pin_url: `https://www.pinterest.com/pin/${p.pin_id}/`,
        pinterest: { ...pin_metrics, ctr, save_rate, error: pin_error, daily },
        site,
      };
    }));

    // Totals
    const totals = pinResults.reduce((acc, r) => {
      acc.impressions += r.pinterest.IMPRESSION;
      acc.saves += r.pinterest.SAVE;
      acc.pin_clicks += r.pinterest.PIN_CLICK;
      acc.outbound_clicks += r.pinterest.OUTBOUND_CLICK;
      acc.site_sessions += r.site.sessions;
      acc.site_orders += r.site.orders;
      return acc;
    }, { impressions: 0, saves: 0, pin_clicks: 0, outbound_clicks: 0, site_sessions: 0, site_orders: 0 });

    return json({
      ok: true,
      account: conn?.account_name ?? null,
      window: { start_date, end_date, days },
      totals,
      pins: pinResults,
    });
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message ?? e) }, 500);
  }
});