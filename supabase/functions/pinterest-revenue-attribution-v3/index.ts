// Pinterest Revenue Attribution Engine V3
// Joins pin queue metadata × funnel events × pin performance into per-pin
// windowed (1d/7d/30d) revenue rollups, then runs a nightly learning loop:
// top 10% pins are cloned via the creative director, bottom 20% pins are
// throttled (priority='low'). Exposes `rebuild`, `learn`, `report`, `run_full`.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Action = "rebuild" | "learn" | "report" | "run_full";

const WINDOWS = [1, 7, 30] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// ---------- REBUILD ----------
async function rebuild(sb: ReturnType<typeof createClient>) {
  // Load all known pinterest_pin_id → metadata
  const { data: queue } = await sb
    .from("pinterest_pin_queue")
    .select(
      "pinterest_pin_id, product_id, product_slug, board_name, pin_title, overlay_text, hook_group, hook_angle, category_key",
    )
    .not("pinterest_pin_id", "is", null);
  const meta = new Map<string, any>();
  for (const r of queue ?? []) meta.set(r.pinterest_pin_id as string, r);

  // Performance (lifetime impressions/clicks/saves)
  const { data: perf } = await sb
    .from("pinterest_pin_performance")
    .select("pin_id, impressions, clicks, saves");
  const perfMap = new Map<string, { impressions: number; clicks: number; saves: number }>();
  for (const r of perf ?? []) {
    perfMap.set(r.pin_id as string, {
      impressions: Number(r.impressions ?? 0),
      clicks: Number((r as any).clicks ?? 0),
      saves: Number(r.saves ?? 0),
    });
  }

  // Funnel events for last 30 days
  const { data: events } = await sb
    .from("pinterest_funnel_events")
    .select("pin_id, event_name, value, occurred_at")
    .gte("occurred_at", isoDaysAgo(30))
    .not("pin_id", "is", null)
    .limit(50000);

  type Bucket = {
    product_views: number; add_to_carts: number; checkouts: number;
    purchases: number; revenue_cents: number; orders: number;
  };
  const buckets = new Map<string, Bucket>(); // key = `${pin_id}|${window}`
  const keyOf = (pin: string, w: number) => `${pin}|${w}`;
  const ensure = (k: string): Bucket => {
    let b = buckets.get(k);
    if (!b) { b = { product_views: 0, add_to_carts: 0, checkouts: 0, purchases: 0, revenue_cents: 0, orders: 0 }; buckets.set(k, b); }
    return b;
  };

  const now = Date.now();
  for (const e of events ?? []) {
    const pin = e.pin_id as string;
    const ageDays = (now - new Date(e.occurred_at as string).getTime()) / 86_400_000;
    const cents = Math.round(Number(e.value ?? 0) * 100);
    for (const w of WINDOWS) {
      if (ageDays > w) continue;
      const b = ensure(keyOf(pin, w));
      switch (e.event_name) {
        case "product_view": case "page_view": b.product_views++; break;
        case "add_to_cart": b.add_to_carts++; break;
        case "begin_checkout": b.checkouts++; break;
        case "purchase": b.purchases++; b.orders++; b.revenue_cents += cents; break;
      }
    }
  }

  // Cover every known pin (even with zero events) so the dashboard can rank them.
  const pinIds = new Set<string>([...buckets.keys()].map((k) => k.split("|")[0]));
  for (const id of meta.keys()) pinIds.add(id);

  const rows: any[] = [];
  for (const pin of pinIds) {
    const m = meta.get(pin) ?? {};
    const p = perfMap.get(pin) ?? { impressions: 0, clicks: 0, saves: 0 };
    for (const w of WINDOWS) {
      const b = buckets.get(keyOf(pin, w)) ?? { product_views: 0, add_to_carts: 0, checkouts: 0, purchases: 0, revenue_cents: 0, orders: 0 };
      const revenue = b.revenue_cents / 100;
      rows.push({
        pin_id: pin,
        window_days: w,
        product_id: m.product_id ?? null,
        product_slug: m.product_slug ?? null,
        board: m.board_name ?? null,
        headline: m.pin_title ?? null,
        cta: m.overlay_text ?? null,
        hook: m.hook_group ?? null,
        creative_angle: m.hook_angle ?? null,
        category: m.category_key ?? null,
        impressions: p.impressions,
        clicks: p.clicks,
        saves: p.saves,
        product_views: b.product_views,
        add_to_carts: b.add_to_carts,
        checkouts: b.checkouts,
        purchases: b.purchases,
        revenue_cents: b.revenue_cents,
        orders: b.orders,
        revenue_per_click: p.clicks > 0 ? +(revenue / p.clicks).toFixed(4) : 0,
        revenue_per_pin: +revenue.toFixed(4),
        roas: 0,
        computed_at: new Date().toISOString(),
      });
    }
  }

  // Upsert in chunks
  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await sb
      .from("pinterest_revenue_attribution_v3")
      .upsert(chunk, { onConflict: "pin_id,window_days" });
    if (error) throw error;
    written += chunk.length;
  }
  return { rows_written: written, pins: pinIds.size };
}

// ---------- LEARN ----------
async function learn(sb: ReturnType<typeof createClient>) {
  const runId = crypto.randomUUID();
  await sb.from("pinterest_revenue_learning_runs").insert({
    id: runId, status: "running", started_at: new Date().toISOString(),
  });

  // 30-day revenue ranking
  const { data: ranked } = await sb
    .from("pinterest_revenue_attribution_v3")
    .select("pin_id, product_id, product_slug, headline, cta, hook, creative_angle, category, revenue_cents, clicks, purchases")
    .eq("window_days", 30)
    .order("revenue_cents", { ascending: false })
    .limit(5000);

  const all = ranked ?? [];
  const earners = all.filter((r) => (r.revenue_cents ?? 0) > 0);
  const totalRevenue = earners.reduce((s, r) => s + Number(r.revenue_cents ?? 0), 0);
  const topN = Math.max(1, Math.ceil(earners.length * 0.1));
  const bottomN = Math.max(0, Math.ceil(all.length * 0.2));
  const topPins = earners.slice(0, topN);
  const bottomPins = all.slice(-bottomN);

  // CLONE: enqueue creative director jobs for each top pin's product
  let cloned = 0;
  for (const p of topPins.slice(0, 25)) {
    if (!p.product_id && !p.product_slug) continue;
    try {
      await sb.functions.invoke("pinterest-creative-director", {
        body: {
          product_id: p.product_id,
          product_slug: p.product_slug,
          source: "revenue_attribution_v3",
          priority: 95,
          seed_meta: {
            cloned_from_pin: p.pin_id,
            cloned_headline: p.headline,
            cloned_cta: p.cta,
            cloned_hook: p.hook,
            cloned_angle: p.creative_angle,
          },
        },
      });
      cloned++;
    } catch (_) { /* swallow per-pin failures */ }
  }

  // THROTTLE: drop bottom-quintile queued duplicates to low priority
  let throttled = 0;
  if (bottomPins.length) {
    const ids = bottomPins.map((p) => p.pin_id).filter(Boolean);
    const { error, count } = await sb
      .from("pinterest_pin_queue")
      .update({ priority: "low" })
      .in("pinterest_pin_id", ids)
      .eq("status", "queued")
      .select("id", { count: "exact", head: true });
    if (!error) throttled = count ?? 0;
  }

  await sb.from("pinterest_revenue_learning_runs").update({
    status: "ok",
    finished_at: new Date().toISOString(),
    pins_scanned: all.length,
    top_pins_cloned: cloned,
    bottom_pins_throttled: throttled,
    total_revenue_cents: totalRevenue,
    details: { top_pin_ids: topPins.slice(0, 25).map((p) => p.pin_id) },
  }).eq("id", runId);

  return { run_id: runId, top_pins_cloned: cloned, bottom_pins_throttled: throttled, total_revenue_cents: totalRevenue };
}

// ---------- REPORT ----------
async function report(sb: ReturnType<typeof createClient>, windowDays = 30) {
  const { data: rows } = await sb
    .from("pinterest_revenue_attribution_v3")
    .select("*")
    .eq("window_days", windowDays)
    .order("revenue_cents", { ascending: false })
    .limit(2000);
  const all = rows ?? [];
  const totalRevenue = all.reduce((s, r) => s + Number(r.revenue_cents ?? 0), 0);
  const totalOrders = all.reduce((s, r) => s + Number(r.orders ?? 0), 0);
  const totalClicks = all.reduce((s, r) => s + Number(r.clicks ?? 0), 0);

  const groupSum = (key: string) => {
    const m = new Map<string, { key: string; revenue_cents: number; orders: number; pins: number }>();
    for (const r of all) {
      const k = (r as any)[key] ?? "(unknown)";
      const g = m.get(k) ?? { key: k, revenue_cents: 0, orders: 0, pins: 0 };
      g.revenue_cents += Number(r.revenue_cents ?? 0);
      g.orders += Number(r.orders ?? 0);
      g.pins += 1;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.revenue_cents - a.revenue_cents).slice(0, 20);
  };

  // Daily trend from funnel events (last N days)
  const { data: trendEvents } = await sb
    .from("pinterest_funnel_events")
    .select("event_name, value, occurred_at")
    .eq("event_name", "purchase")
    .gte("occurred_at", isoDaysAgo(windowDays));
  const dayMap = new Map<string, { day: string; revenue_cents: number; orders: number }>();
  for (const e of trendEvents ?? []) {
    const day = (e.occurred_at as string).slice(0, 10);
    const g = dayMap.get(day) ?? { day, revenue_cents: 0, orders: 0 };
    g.revenue_cents += Math.round(Number(e.value ?? 0) * 100);
    g.orders += 1;
    dayMap.set(day, g);
  }
  const dailyTrend = [...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day));

  return {
    window_days: windowDays,
    totals: {
      revenue_cents: totalRevenue,
      orders: totalOrders,
      clicks: totalClicks,
      revenue_per_click: totalClicks > 0 ? +(totalRevenue / 100 / totalClicks).toFixed(4) : 0,
      revenue_per_pin: all.length > 0 ? +(totalRevenue / 100 / all.length).toFixed(4) : 0,
      roas: 0,
    },
    top_pins: all.slice(0, 50),
    top_categories: groupSum("category"),
    top_headlines: groupSum("headline"),
    top_ctas: groupSum("cta"),
    top_hooks: groupSum("hook"),
    top_angles: groupSum("creative_angle"),
    daily_trend: dailyTrend,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = ((body.action ?? new URL(req.url).searchParams.get("action") ?? "report") as Action);
    const windowDays = Number(body.window_days ?? 30);

    if (action === "rebuild") return json({ ok: true, ...(await rebuild(sb)) });
    if (action === "learn") return json({ ok: true, ...(await learn(sb)) });
    if (action === "run_full") {
      const r = await rebuild(sb);
      const l = await learn(sb);
      return json({ ok: true, rebuild: r, learn: l });
    }
    return json({ ok: true, ...(await report(sb, windowDays)) });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});