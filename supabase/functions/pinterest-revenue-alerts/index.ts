// Pinterest Revenue Alerts — daily/6h watchdog.
// Inserts/refreshes rows in monitoring_alerts with category='pinterest'.
//
// Detects:
//  - CTR drop (7d vs prior 7d) > 30%
//  - Conversion drop (purchases / product_views, 7d vs prior 7d) > 40%
//  - Traffic spike (today clicks > 2× 7d daily avg)
//  - Stockout risk: products with force_promote override but is_active=false
//  - Missing destination URL / image for posted pins
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Alert = {
  alert_key: string;
  severity: "info" | "warning" | "critical";
  category: string;
  title: string;
  description: string;
  suggested_fix?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const alerts: Alert[] = [];

  try {
    const today = new Date().toISOString().slice(0, 10);
    const d7 = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const d14 = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);

    // --- 1. CTR drop (7d vs prior 7d) ---
    const { data: an } = await sb
      .from("pinterest_analytics_daily")
      .select("day,impressions,outbound_clicks")
      .gte("day", d14);
    const cur = { imp: 0, clk: 0 };
    const prev = { imp: 0, clk: 0 };
    for (const r of (an ?? []) as { day: string; impressions: number; outbound_clicks: number }[]) {
      const bucket = r.day >= d7 ? cur : prev;
      bucket.imp += r.impressions || 0;
      bucket.clk += r.outbound_clicks || 0;
    }
    const ctrCur = cur.imp > 0 ? cur.clk / cur.imp : 0;
    const ctrPrev = prev.imp > 0 ? prev.clk / prev.imp : 0;
    if (prev.imp >= 1000 && ctrPrev > 0 && ctrCur < ctrPrev * 0.7) {
      alerts.push({
        alert_key: `pinterest:ctr_drop:${today}`,
        severity: "warning",
        category: "pinterest",
        title: `Pinterest CTR dropped ${Math.round((1 - ctrCur / ctrPrev) * 100)}% week-over-week`,
        description: `7d CTR ${(ctrCur * 100).toFixed(2)}% vs prior ${(ctrPrev * 100).toFixed(2)}% (imp ${cur.imp} vs ${prev.imp}).`,
        suggested_fix: "Refresh underperforming overlays and rotate creative archetypes in the Growth Engine.",
      });
    }

    // --- 2. Conversion drop & 3. Revenue funnel ---
    const { data: ff } = await sb
      .from("pinterest_revenue_funnel_daily")
      .select("day,product_views,purchases,outbound_clicks,revenue_cents")
      .gte("day", d14);
    const cf = { pv: 0, pur: 0, clk: 0, rev: 0 };
    const pf = { pv: 0, pur: 0, clk: 0, rev: 0 };
    for (const r of (ff ?? []) as { day: string; product_views: number; purchases: number; outbound_clicks: number; revenue_cents: number }[]) {
      const b = r.day >= d7 ? cf : pf;
      b.pv += Number(r.product_views || 0);
      b.pur += Number(r.purchases || 0);
      b.clk += Number(r.outbound_clicks || 0);
      b.rev += Number(r.revenue_cents || 0);
    }
    const convCur = cf.pv > 0 ? cf.pur / cf.pv : 0;
    const convPrev = pf.pv > 0 ? pf.pur / pf.pv : 0;
    if (pf.pv >= 100 && convPrev > 0 && convCur < convPrev * 0.6) {
      alerts.push({
        alert_key: `pinterest:conv_drop:${today}`,
        severity: "critical",
        category: "pinterest",
        title: `Pinterest conversion rate down ${Math.round((1 - convCur / convPrev) * 100)}%`,
        description: `7d conv ${(convCur * 100).toFixed(2)}% (${cf.pur}/${cf.pv}) vs prior ${(convPrev * 100).toFixed(2)}%. 7d revenue $${(cf.rev / 100).toFixed(2)}.`,
        suggested_fix: "Audit landing PDPs for top traffic products, verify pricing/availability and Klarna messaging.",
      });
    }

    // --- 4. Traffic spike (today vs 7d avg) ---
    const todayRow = (an ?? []).filter((r: { day: string }) => r.day === today)
      .reduce((a: number, r: { outbound_clicks: number }) => a + (r.outbound_clicks || 0), 0);
    const avg7 = cur.clk / 7;
    if (avg7 >= 5 && todayRow > avg7 * 2) {
      alerts.push({
        alert_key: `pinterest:traffic_spike:${today}`,
        severity: "info",
        category: "pinterest",
        title: `Pinterest traffic spike: ${todayRow} clicks today vs 7d avg ${avg7.toFixed(1)}`,
        description: "Scale up the winning creative — consider pushing more variants of top boards/products today.",
        suggested_fix: "Run pinterest-growth-engine action=run with productsPerRun=12 to capitalize on momentum.",
      });
    }

    // --- 5. Stockout risk on promoted products ---
    const { data: overrides } = await sb
      .from("pinterest_autopilot_overrides")
      .select("product_id, action")
      .eq("action", "force_promote");
    const promoIds = (overrides ?? []).map((o: { product_id: string }) => o.product_id);
    if (promoIds.length) {
      const { data: prods } = await sb
        .from("products")
        .select("id, slug, name, is_active")
        .in("id", promoIds);
      const dead = (prods ?? []).filter((p: { is_active: boolean }) => !p.is_active);
      if (dead.length) {
        alerts.push({
          alert_key: `pinterest:promoted_unavailable:${today}`,
          severity: "critical",
          category: "pinterest",
          title: `${dead.length} promoted product(s) became unavailable`,
          description: dead.slice(0, 8).map((p: { slug: string; name: string }) => `${p.name} (${p.slug})`).join(" · "),
          suggested_fix: "Remove force_promote override or restock; current pins waste impressions on dead PDPs.",
        });
      }
    }

    // --- 6. Posted pins with missing image or link ---
    const { count: brokenCount } = await sb
      .from("pinterest_pin_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "posted")
      .or("pin_image_url.is.null,destination_link.is.null");
    if ((brokenCount ?? 0) > 0) {
      alerts.push({
        alert_key: `pinterest:broken_pins:${today}`,
        severity: "warning",
        category: "pinterest",
        title: `${brokenCount} live Pinterest pins missing image or destination`,
        description: "These pins waste traffic and may trigger Pinterest spam flags.",
        suggested_fix: "Run pinterest-live-pin-repair-internal to backfill or delete the offenders.",
      });
    }

    // --- Upsert to monitoring_alerts (active/refresh) ---
    let upserted = 0;
    const nowIso = new Date().toISOString();
    for (const a of alerts) {
      const { error } = await sb.from("monitoring_alerts").upsert(
        {
          alert_key: a.alert_key,
          severity: a.severity,
          category: a.category,
          title: a.title,
          description: a.description,
          suggested_fix: a.suggested_fix ?? null,
          is_active: true,
          last_detected_at: nowIso,
        },
        { onConflict: "alert_key" },
      );
      if (!error) upserted++;
    }

    // Auto-resolve any prior pinterest:* alerts not raised this run.
    const activeKeys = new Set(alerts.map((a) => a.alert_key));
    const { data: stale } = await sb
      .from("monitoring_alerts")
      .select("id, alert_key")
      .eq("category", "pinterest")
      .eq("is_active", true);
    let resolved = 0;
    for (const row of (stale ?? []) as { id: string; alert_key: string }[]) {
      if (!activeKeys.has(row.alert_key)) {
        await sb.from("monitoring_alerts").update({ is_active: false, resolved_at: nowIso }).eq("id", row.id);
        resolved++;
      }
    }

    return json({ ok: true, traceId, raised: alerts.length, upserted, resolved, alerts });
  } catch (e) {
    console.error("[pinterest-revenue-alerts]", traceId, e);
    return json({ ok: false, traceId, message: (e as Error).message }, 500);
  }
});