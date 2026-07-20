// Pinterest Product Conversion Score
//
// Aggregates per-product engagement & conversion signals from real Pinterest
// human traffic (sessions linked via pinterest_attribution_sessions →
// lp_funnel_events / pinterest_funnel_events) and produces a single
// composite Product Conversion Score. Pins are auto-distributed:
//   • Top 20%    → priority='high', clone winning pins via generator
//   • Middle 60% → priority unchanged
//   • Bottom 20% → status='paused', priority='low'
// New pins are only generated for products with above-average score.
//
// Action mode is opt-in via { apply: true } to keep the dashboard safe.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders as cors } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type EventRow = {
  session_id: string;
  event_name: string;
  product_id: string | null;
  dwell_ms: number | null;
  scroll_depth_at_click: number | null;
};

type ProductAgg = {
  product_id: string;
  product_slug: string | null;
  product_name: string | null;
  sessions: number;
  pdp_views: number;
  scroll25: number;
  scroll50: number;
  scroll75: number;
  scroll100: number;
  gallery_interactions: number;
  variant_selections: number;
  atc: number;
  checkout: number;
  purchases: number;
  total_dwell_ms: number;
  dwell_samples: number;
  // derived
  avg_dwell_ms: number;
  avg_scroll_depth: number;
  atc_rate: number;
  buy_rate: number;
  engagement_score: number;
  conversion_score: number;
  product_score: number;
  tier: "winner" | "neutral" | "loser";
};

function jres(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function engagementScore(p: ProductAgg) {
  // weighted: dwell + scroll depth + gallery interactions
  const dwellPts = clamp(p.avg_dwell_ms / 600, 0, 50); // 30s -> 50
  const scrollPts = clamp(p.avg_scroll_depth / 2, 0, 30); // 60% -> 30
  const galleryPts = clamp((p.gallery_interactions / Math.max(1, p.pdp_views)) * 40, 0, 20);
  return Math.round(dwellPts + scrollPts + galleryPts);
}

function conversionScore(p: ProductAgg) {
  // ATC rate dominates; variant selection signals real consideration
  const atcPts = clamp(p.atc_rate * 200, 0, 60);
  const variantPts = clamp((p.variant_selections / Math.max(1, p.pdp_views)) * 80, 0, 15);
  const buyPts = clamp(p.buy_rate * 500, 0, 25);
  const denom = Math.max(0.4, Math.min(1, p.pdp_views / 25));
  return Math.round((atcPts + variantPts + buyPts) * denom);
}

function composite(p: ProductAgg) {
  return Math.round(p.engagement_score * 0.4 + p.conversion_score * 0.6);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const traceId = crypto.randomUUID();

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const days = Number(body.days ?? 30);
    const apply = body.apply === true;
    const generate = body.generate === true;

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    // 1) Pinterest sessions (real human only — exclude prefetch/bot via
    //    join with lp_funnel_events.is_bot=false when available).
    const { data: sessions, error: sErr } = await sb
      .from("pinterest_attribution_sessions")
      .select("session_key, landing_slug")
      .gte("first_seen", since)
      .limit(20000);
    if (sErr) throw sErr;
    const sessionKeys = new Set((sessions ?? []).map((s) => s.session_key));
    if (sessionKeys.size === 0) {
      return jres({ ok: true, traceId, message: "no sessions", products: [] });
    }

    // 2) Pull lp_funnel_events for those sessions only (real humans).
    //    Page in batches to dodge IN-list limits.
    const ids = Array.from(sessionKeys);
    const events: EventRow[] = [];
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { data, error } = await sb
        .from("lp_funnel_events")
        .select("session_id,event_name,product_id,dwell_ms,scroll_depth_at_click")
        .in("session_id", chunk)
        // Keep rows that are explicitly human OR unclassified (is_bot IS NULL).
        // The original `.eq("is_bot", false)` silently dropped every legacy
        // row whose bot flag was never written, which made `products_scored`
        // collapse to 0 even when valid sessions+events existed.
        .or("is_bot.is.null,is_bot.eq.false")
        .gte("created_at", since);
      if (error) throw error;
      events.push(...((data ?? []) as EventRow[]));
    }

    // 3) Aggregate per product_id.
    const agg = new Map<string, ProductAgg>();
    const sessionsPerProduct = new Map<string, Set<string>>();
    for (const e of events) {
      const pid = e.product_id;
      if (!pid) continue;
      let a = agg.get(pid);
      if (!a) {
        a = {
          product_id: pid, product_slug: null, product_name: null,
          sessions: 0, pdp_views: 0,
          scroll25: 0, scroll50: 0, scroll75: 0, scroll100: 0,
          gallery_interactions: 0, variant_selections: 0,
          atc: 0, checkout: 0, purchases: 0,
          total_dwell_ms: 0, dwell_samples: 0,
          avg_dwell_ms: 0, avg_scroll_depth: 0,
          atc_rate: 0, buy_rate: 0,
          engagement_score: 0, conversion_score: 0, product_score: 0,
          tier: "neutral",
        };
        agg.set(pid, a);
        sessionsPerProduct.set(pid, new Set());
      }
      sessionsPerProduct.get(pid)!.add(e.session_id);
      switch (e.event_name) {
        case "pdp_view":
        case "view_item":            a.pdp_views++; break;
        case "scroll_depth_25":      a.scroll25++; break;
        case "scroll_depth_50":      a.scroll50++; break;
        case "scroll_depth_75":      a.scroll75++; break;
        case "scroll_depth_100":     a.scroll100++; break;
        case "image_interaction":    a.gallery_interactions++; break;
        case "variant_select":
        case "variant_change":       a.variant_selections++; break;
        case "add_to_cart":          a.atc++; break;
        case "begin_checkout":       a.checkout++; break;
        case "payment_success":
        case "purchase":             a.purchases++; break;
        case "session_end":
          if (e.dwell_ms && e.dwell_ms > 0) {
            a.total_dwell_ms += e.dwell_ms;
            a.dwell_samples++;
          }
          break;
      }
    }

    // 4) Hydrate slug/name + finalize derived metrics & scores.
    const productIds = Array.from(agg.keys());
    if (productIds.length > 0) {
      const { data: prods } = await sb
        .from("products").select("id,slug,name").in("id", productIds);
      for (const p of prods ?? []) {
        const a = agg.get(p.id as string);
        if (a) { a.product_slug = (p as any).slug; a.product_name = (p as any).name; }
      }
    }

    for (const [pid, a] of agg) {
      a.sessions = sessionsPerProduct.get(pid)?.size ?? 0;
      a.avg_dwell_ms = a.dwell_samples ? Math.round(a.total_dwell_ms / a.dwell_samples) : 0;
      // Rough avg scroll depth from milestones reached.
      const depthSum = a.scroll25 * 25 + a.scroll50 * 50 + a.scroll75 * 75 + a.scroll100 * 100;
      const depthHits = a.scroll25 + a.scroll50 + a.scroll75 + a.scroll100;
      a.avg_scroll_depth = depthHits ? Math.round(depthSum / depthHits) : 0;
      a.atc_rate = a.pdp_views ? a.atc / a.pdp_views : 0;
      a.buy_rate = a.pdp_views ? a.purchases / a.pdp_views : 0;
      a.engagement_score = engagementScore(a);
      a.conversion_score = conversionScore(a);
      a.product_score = composite(a);
    }

    // 5) Tier into winner/neutral/loser. Threshold is intentionally low
    //    (>=1 pdp_view OR >=1 session) so the dashboard fills as soon as
    //    real Pinterest humans land on a PDP — the previous >=3 cutoff
    //    suppressed every product during the early traffic phase.
    const ranked = Array.from(agg.values())
      .filter((p) => p.pdp_views >= 1 || p.sessions >= 1)
      .sort((a, b) => b.product_score - a.product_score);
    const n = ranked.length;
    const winnerCut = Math.max(1, Math.floor(n * 0.2));
    const loserCut  = Math.max(1, Math.floor(n * 0.2));
    ranked.forEach((p, i) => {
      if (i < winnerCut) p.tier = "winner";
      else if (i >= n - loserCut) p.tier = "loser";
      else p.tier = "neutral";
    });
    const avgScore = n ? ranked.reduce((s, p) => s + p.product_score, 0) / n : 0;

    // 6) Apply distribution changes — opt-in only.
    const actions: Record<string, number> = {
      boosted_pins: 0, paused_pins: 0, generated_pins: 0, errors: 0,
    };
    if (apply && ranked.length > 0) {
      const winnerIds = ranked.filter((p) => p.tier === "winner").map((p) => p.product_id);
      const loserIds  = ranked.filter((p) => p.tier === "loser").map((p) => p.product_id);

      if (winnerIds.length) {
        const { count } = await sb
          .from("pinterest_pin_queue")
          .update({ priority: "high", status: "queued", updated_at: new Date().toISOString() }, { count: "exact" })
          .in("product_id", winnerIds)
          .in("status", ["queued", "paused"]);
        actions.boosted_pins = count ?? 0;
      }
      if (loserIds.length) {
        const { count } = await sb
          .from("pinterest_pin_queue")
          .update({ priority: "low", status: "paused", updated_at: new Date().toISOString() }, { count: "exact" })
          .in("product_id", loserIds)
          .in("status", ["queued"]);
        actions.paused_pins = count ?? 0;
      }

      // 7) Generate brand-new pins only for above-average products.
      if (generate) {
        const eligible = ranked
          .filter((p) => p.product_score >= avgScore && p.tier !== "loser")
          .slice(0, 10); // cap per run
        for (const p of eligible) {
          try {
            const res = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-pin-generator`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SERVICE_KEY}`,
                apikey: SERVICE_KEY,
              },
              body: JSON.stringify({ productId: p.product_id, productSlug: p.product_slug }),
            });
            if (res.ok) actions.generated_pins++;
            else actions.errors++;
          } catch {
            actions.errors++;
          }
        }
      }
    }

    return jres({
      ok: true,
      traceId,
      message: "scored",
      days,
      apply,
      generate,
      stats: {
        sessions: sessionKeys.size,
        events: events.length,
        products_scored: ranked.length,
        avg_score: Math.round(avgScore),
        winners: ranked.filter((p) => p.tier === "winner").length,
        neutral: ranked.filter((p) => p.tier === "neutral").length,
        losers:  ranked.filter((p) => p.tier === "loser").length,
      },
      actions,
      products: ranked,
    });
  } catch (err) {
    return jres({ ok: false, traceId, message: (err as Error).message }, 500);
  }
});