// Pinterest per-pin attribution dashboard + auto-rank engine.
// Actions:
//   action=dashboard (default) — returns ranked rows with all metrics
//   action=auto_rank — pauses bottom 20%, boosts top 20%, clones winners
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type PinRow = {
  pin_id: string;
  product_id: string | null;
  product_url: string | null;
  board_name: string | null;
  impressions: number;
  outbound_clicks: number;
  ctr: number;
  sessions: number;
  pageviews: number;
  add_to_carts: number;
  purchases: number;
  saves: number;
  engagement_score: number;
  revenue_score: number;
  conversion_score: number;
  score: number;
  rank: number;
  tier: "winner" | "loser" | "neutral";
  status: string | null;
};

// Sub-scores, each on a roughly 0..100 scale for comparability.
function engagementScore(r: { impressions: number; outbound_clicks: number; saves: number; ctr: number }): number {
  // CTR is the dominant signal; saves + raw clicks add depth.
  return Math.min(100, r.ctr * 2000 + Math.log10(1 + r.outbound_clicks) * 15 + Math.log10(1 + r.saves) * 10);
}
function revenueScore(r: { purchases: number; add_to_carts: number; outbound_clicks: number }): number {
  return Math.min(100, r.purchases * 40 + r.add_to_carts * 8 + r.outbound_clicks * 0.5);
}
function conversionScore(r: { sessions: number; outbound_clicks: number; add_to_carts: number; purchases: number }): number {
  const denom = Math.max(r.sessions, r.outbound_clicks, 1);
  const atcRate = r.add_to_carts / denom;
  const buyRate = r.purchases / denom;
  // Require minimum traffic so 1-session pins don't artificially top the list.
  const confidence = Math.min(1, denom / 25);
  return Math.min(100, (atcRate * 60 + buyRate * 200) * confidence * 100);
}
function composite(e: number, r: number, c: number): number {
  return e * 0.25 + r * 0.45 + c * 0.30;
}

async function buildRows(supabase: ReturnType<typeof createClient>, days: number): Promise<PinRow[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const [perfRes, queueRes, sessRes, evRes] = await Promise.all([
    supabase
      .from("pinterest_pin_performance")
      .select("pin_id, product_id, product_url, impressions, clicks, saves, status, updated_at"),
    supabase
      .from("pinterest_pin_queue")
      .select("pinterest_pin_id, board_name, product_slug")
      .not("pinterest_pin_id", "is", null),
    supabase
      .from("pinterest_attribution_sessions")
      .select("session_key, pin_id, first_seen")
      .gte("first_seen", since)
      .not("pin_id", "is", null),
    supabase
      .from("pinterest_funnel_events")
      .select("session_key, pin_id, event_name, occurred_at")
      .gte("occurred_at", since),
  ]);

  const boardByPin = new Map<string, string>();
  for (const q of (queueRes.data ?? []) as Array<{ pinterest_pin_id: string; board_name: string | null }>) {
    if (q.pinterest_pin_id && q.board_name) boardByPin.set(q.pinterest_pin_id, q.board_name);
  }

  // session_key -> pin_id (from attribution table)
  const sessionPin = new Map<string, string>();
  const sessionsByPin = new Map<string, Set<string>>();
  for (const s of (sessRes.data ?? []) as Array<{ session_key: string; pin_id: string }>) {
    sessionPin.set(s.session_key, s.pin_id);
    if (!sessionsByPin.has(s.pin_id)) sessionsByPin.set(s.pin_id, new Set());
    sessionsByPin.get(s.pin_id)!.add(s.session_key);
  }

  const pvByPin = new Map<string, number>();
  const atcByPin = new Map<string, number>();
  const buyByPin = new Map<string, number>();
  for (const e of (evRes.data ?? []) as Array<{ session_key: string; pin_id: string | null; event_name: string }>) {
    const pid = e.pin_id ?? sessionPin.get(e.session_key);
    if (!pid) continue;
    if (e.event_name === "page_view" || e.event_name === "product_view") pvByPin.set(pid, (pvByPin.get(pid) ?? 0) + 1);
    else if (e.event_name === "add_to_cart") atcByPin.set(pid, (atcByPin.get(pid) ?? 0) + 1);
    else if (e.event_name === "purchase") buyByPin.set(pid, (buyByPin.get(pid) ?? 0) + 1);
  }

  const rows: PinRow[] = [];
  for (const p of (perfRes.data ?? []) as Array<{
    pin_id: string; product_id: string | null; product_url: string | null;
    impressions: number | null; clicks: number | null; saves: number | null; status: string | null;
  }>) {
    const impressions = p.impressions ?? 0;
    const outbound = p.clicks ?? 0;
    const ctr = impressions > 0 ? outbound / impressions : 0;
    const sessions = sessionsByPin.get(p.pin_id)?.size ?? 0;
    const atc = atcByPin.get(p.pin_id) ?? 0;
    const buys = buyByPin.get(p.pin_id) ?? 0;
    const saves = p.saves ?? 0;
    const eng = engagementScore({ impressions, outbound_clicks: outbound, saves, ctr });
    const rev = revenueScore({ purchases: buys, add_to_carts: atc, outbound_clicks: outbound });
    const conv = conversionScore({ sessions, outbound_clicks: outbound, add_to_carts: atc, purchases: buys });
    rows.push({
      pin_id: p.pin_id,
      product_id: p.product_id,
      product_url: p.product_url,
      board_name: boardByPin.get(p.pin_id) ?? null,
      impressions,
      outbound_clicks: outbound,
      ctr,
      sessions,
      pageviews: pvByPin.get(p.pin_id) ?? 0,
      add_to_carts: atc,
      purchases: buys,
      saves,
      engagement_score: eng,
      revenue_score: rev,
      conversion_score: conv,
      score: composite(eng, rev, conv),
      rank: 0,
      tier: "neutral",
      status: p.status ?? null,
    });
  }

  rows.sort((a, b) => b.score - a.score);
  const n = rows.length;
  // Top 20% winners / middle 60% neutral / bottom 20% losers.
  const topCut = Math.max(1, Math.floor(n * 0.2));
  const botStart = n - Math.max(1, Math.floor(n * 0.2));
  rows.forEach((r, i) => {
    r.rank = i + 1;
    if (i < topCut && r.score > 0) r.tier = "winner";
    else if (i >= botStart) r.tier = "loser";
    else r.tier = "neutral";
  });
  return rows;
}

async function runAutoRank(supabase: ReturnType<typeof createClient>, days: number) {
  const rows = await buildRows(supabase, days);
  const winners = rows.filter((r) => r.tier === "winner");
  const losers = rows.filter((r) => r.tier === "loser");

  // Pause losers
  for (const l of losers) {
    await supabase.from("pinterest_pin_performance").update({ status: "paused" }).eq("pin_id", l.pin_id);
    await supabase.from("pinterest_loser_blocklist").insert({
      asset_id: l.pin_id,
      product_slug: l.product_url ?? null,
      reason: `auto: rank ${l.rank}/${rows.length}, score ${l.score.toFixed(1)}`,
      blocked_until: new Date(Date.now() + 30 * 86400_000).toISOString(),
    });
  }

  // Boost winners
  for (const w of winners) {
    await supabase.from("pinterest_pin_performance").update({ status: "boosted" }).eq("pin_id", w.pin_id);
  }

  // Clone top winners (existing function does the heavy lifting)
  let cloneOk = false;
  let cloneErr: string | null = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-video-clone-top-performers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      body: JSON.stringify({ limit: Math.min(winners.length, 10), source: "pin-attribution-auto-rank" }),
    });
    cloneOk = r.ok;
    if (!r.ok) cloneErr = `clone http ${r.status}`;
  } catch (e) {
    cloneErr = (e as Error).message;
  }

  return {
    total: rows.length,
    paused: losers.length,
    boosted: winners.length,
    cloneOk,
    cloneErr,
    winners: winners.slice(0, 20),
    losers: losers.slice(0, 20),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = url.searchParams.get("action") ?? body.action ?? "dashboard";
    const days = Math.min(180, Math.max(1, Number(url.searchParams.get("days") ?? body.days ?? 30)));

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    if (action === "auto_rank") {
      const result = await runAutoRank(supabase, days);
      return new Response(JSON.stringify({ ok: true, action, days, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = await buildRows(supabase, days);
    return new Response(
      JSON.stringify({
        ok: true,
        action: "dashboard",
        days,
        total: rows.length,
        totals: rows.reduce(
          (a, r) => ({
            impressions: a.impressions + r.impressions,
            outbound_clicks: a.outbound_clicks + r.outbound_clicks,
            sessions: a.sessions + r.sessions,
            pageviews: a.pageviews + r.pageviews,
            add_to_carts: a.add_to_carts + r.add_to_carts,
            purchases: a.purchases + r.purchases,
          }),
          { impressions: 0, outbound_clicks: 0, sessions: 0, pageviews: 0, add_to_carts: 0, purchases: 0 },
        ),
        rows,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});