/**
 * Conversion Reality Analyzer — Genesis V2 Commercial Reality Sprint.
 *
 * Runs hourly (or on-demand). Reads the last 24h of internal funnel + CIE
 * data and writes:
 *   - one row per run into `conversion_reality_runs` (headline metrics)
 *   - one row per top-leaking product into `conversion_reality_products`
 *   - one row per source × device segment into `conversion_reality_segments`
 *
 * Also opens auto-incidents into `cie_incidents` when leak patterns trip
 * the playbook thresholds (ATC>0/checkout=0, paid traffic arriving as
 * direct, short median session, high PDP views with no ATC).
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

interface Row { [k: string]: unknown }
const num = (v: unknown, d = 0) => (typeof v === "number" && !Number.isNaN(v) ? v : d);

function leakReason(p: {
  pdp_views: number; atc: number; checkouts: number; purchases: number;
}): { step: string; severity: number; fix: string } {
  const { pdp_views, atc, checkouts, purchases } = p;
  if (pdp_views >= 20 && atc === 0) {
    return {
      step: "pdp_to_atc",
      severity: pdp_views,
      fix: "PDP gets traffic but never converts to cart. Check price vs perceived value, hero image quality, benefit bullets, and stock/variant friction.",
    };
  }
  if (atc >= 3 && checkouts === 0) {
    return {
      step: "atc_to_checkout",
      severity: atc * 4,
      fix: "Visitors add to cart but never start checkout. Likely shipping cost shock, variant friction, or mobile sticky-bar overlap. Verify Cart page CTA + delivery copy.",
    };
  }
  if (checkouts >= 2 && purchases === 0) {
    return {
      step: "checkout_to_purchase",
      severity: checkouts * 6,
      fix: "Checkout starts without a single paid order. Inspect Stripe session errors, country/payment-method blocks, and Klarna eligibility.",
    };
  }
  if (pdp_views > 0 && purchases === 0 && atc > 0) {
    return {
      step: "mixed_leak",
      severity: atc + checkouts * 2,
      fix: "Multiple drop-offs across the funnel. Run a single-product mobile PDP regression on /products/{slug}.",
    };
  }
  return { step: "healthy", severity: 0, fix: "No structural leak detected." };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") || "";
  const requestSecret = req.headers.get("x-internal-secret") || "";

  const admin = createClient(supabaseUrl, serviceKey);

  // Auth: admin JWT OR matching internal secret (used by cron).
  let authorized = false;
  if (internalSecret && requestSecret === internalSecret) {
    authorized = true;
  } else {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (token) {
      const { data: userRes } = await admin.auth.getUser(token);
      if (userRes.user) {
        const { data: role } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", userRes.user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (role) authorized = true;
      }
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const windowHours = 24;
  const since = new Date(Date.now() - windowHours * 3_600_000).toISOString();

  try {
    // ── Pull funnel signals ────────────────────────────────────────────
    const [sessionsRes, journeyRes, funnelRes, ordersRes] = await Promise.all([
      admin.from("cie_sessions")
        .select("id, source, medium, campaign, country, device, started_at, ended_at, page_views, duration_seconds, is_bot, entry_path, utm_source, utm_medium, utm_campaign")
        .gte("started_at", since)
        .limit(10000),
      admin.from("cie_journey_steps")
        .select("session_id, step, product_id, occurred_at")
        .gte("occurred_at", since)
        .limit(50000),
      admin.from("checkout_funnel_events")
        .select("session_id, stripe_session_id, step, value, created_at, metadata")
        .gte("created_at", since)
        .limit(50000),
      admin.from("orders")
        .select("id, total_amount, status, created_at, items, ga_client_id")
        .gte("created_at", since)
        .limit(5000),
    ]);

    const sessions = (sessionsRes.data || []) as Row[];
    const journey = (journeyRes.data || []) as Row[];
    const funnel = (funnelRes.data || []) as Row[];
    const orders = (ordersRes.data || []) as Row[];

    // ── Headline metrics ───────────────────────────────────────────────
    const sessionsTotal = sessions.length;
    const pageviewsTotal = sessions.reduce((s, r) => s + num((r as any).page_views, 0), 0);
    const pdpViews = journey.filter(r => (r as any).step === "view_item").length;
    const atc = funnel.filter(r => (r as any).step === "add_to_cart").length
      + journey.filter(r => (r as any).step === "add_to_cart").length;
    const beginCheckouts = funnel.filter(r => (r as any).step === "begin_checkout").length;
    const purchases = orders.filter(o => (o as any).status === "paid").length;
    const revenue = orders.filter(o => (o as any).status === "paid")
      .reduce((s, o) => s + num((o as any).total_amount, 0), 0);

    // Traffic quality: % of sessions ≥10s, ≥2 page_views, not bot.
    const qualSessions = sessions.filter(s =>
      !(s as any).is_bot &&
      num((s as any).duration_seconds, 0) >= 10 &&
      num((s as any).page_views, 0) >= 2,
    ).length;
    const trafficQuality = sessionsTotal ? Math.round((qualSessions / sessionsTotal) * 100) : 0;

    // Mismatch rate: entry_path is a PDP but no view_item on a matching slug within 30s.
    // Approximate by counting sessions whose entry_path starts with /products/ but who
    // never logged a view_item journey step.
    const pdpEntrySessions = sessions.filter(s => {
      const p = String((s as any).entry_path || "");
      return p.startsWith("/products/");
    });
    const journeyBySession = new Set(journey.filter(j => (j as any).step === "view_item")
      .map(j => String((j as any).session_id)));
    const mismatch = pdpEntrySessions.filter(s => !journeyBySession.has(String((s as any).id))).length;
    const mismatchPct = pdpEntrySessions.length
      ? Math.round((mismatch / pdpEntrySessions.length) * 100)
      : 0;

    const pdpConvPct = pdpViews ? Math.round((atc / pdpViews) * 100) : 0;
    const checkoutStartPct = atc ? Math.round((beginCheckouts / atc) * 100) : 0;

    // ── Insert run row ─────────────────────────────────────────────────
    const { data: runRow, error: runErr } = await admin
      .from("conversion_reality_runs")
      .insert({
        window_hours: windowHours,
        sessions_total: sessionsTotal,
        pageviews_total: pageviewsTotal,
        pdp_views: pdpViews,
        add_to_carts: atc,
        begin_checkouts: beginCheckouts,
        purchases,
        revenue_usd: Number(revenue.toFixed(2)),
        traffic_quality_score: trafficQuality,
        mismatch_rate_pct: mismatchPct,
        pdp_conversion_pct: pdpConvPct,
        checkout_start_pct: checkoutStartPct,
        summary: {
          pdp_entry_sessions: pdpEntrySessions.length,
          mismatch_sessions: mismatch,
          paid_orders: purchases,
        },
      })
      .select("id")
      .single();
    if (runErr) throw runErr;
    const runId = (runRow as any).id as string;

    // ── Per-product leak rollup ───────────────────────────────────────
    const byProduct = new Map<string, { pdp: number; atc: number; checkouts: number; purchases: number }>();
    for (const j of journey) {
      const pid = String((j as any).product_id || "");
      if (!pid) continue;
      const r = byProduct.get(pid) || { pdp: 0, atc: 0, checkouts: 0, purchases: 0 };
      if ((j as any).step === "view_item") r.pdp++;
      if ((j as any).step === "add_to_cart") r.atc++;
      if ((j as any).step === "begin_checkout") r.checkouts++;
      byProduct.set(pid, r);
    }
    // Map purchases by product id from orders.items.
    for (const o of orders.filter(o => (o as any).status === "paid")) {
      const items = ((o as any).items as Array<{ id?: string }>) || [];
      for (const it of items) {
        const pid = String(it.id || "");
        if (!pid) continue;
        const r = byProduct.get(pid) || { pdp: 0, atc: 0, checkouts: 0, purchases: 0 };
        r.purchases++;
        byProduct.set(pid, r);
      }
    }
    const productRows = Array.from(byProduct.entries()).map(([pid, r]) => {
      const leak = leakReason({ pdp_views: r.pdp, atc: r.atc, checkouts: r.checkouts, purchases: r.purchases });
      const confidence = Math.min(100, (r.pdp + r.atc * 3 + r.checkouts * 6) * 2);
      return {
        run_id: runId,
        product_id: pid,
        pdp_views: r.pdp,
        add_to_carts: r.atc,
        begin_checkouts: r.checkouts,
        purchases: r.purchases,
        pdp_to_atc_pct: r.pdp ? Math.round((r.atc / r.pdp) * 100) : 0,
        atc_to_checkout_pct: r.atc ? Math.round((r.checkouts / r.atc) * 100) : 0,
        leak_step: leak.step,
        leak_severity: leak.severity,
        recommended_fix: leak.fix,
        confidence,
      };
    })
      .sort((a, b) => b.leak_severity - a.leak_severity)
      .slice(0, 25);
    if (productRows.length) await admin.from("conversion_reality_products").insert(productRows);

    // ── Segment rollup: source × device ────────────────────────────────
    const segMap = new Map<string, {
      source: string; medium: string; campaign: string; country: string; device: string;
      sessions: number; pdp: number; atc: number; purchases: number; quality: number;
    }>();
    for (const s of sessions) {
      const k = [s as any].map(x => `${x.source || x.utm_source || "direct"}|${x.medium || x.utm_medium || "none"}|${x.device || "unknown"}`).join("");
      const entry = segMap.get(k) || {
        source: String((s as any).source || (s as any).utm_source || "direct"),
        medium: String((s as any).medium || (s as any).utm_medium || "none"),
        campaign: String((s as any).campaign || (s as any).utm_campaign || ""),
        country: String((s as any).country || ""),
        device: String((s as any).device || "unknown"),
        sessions: 0, pdp: 0, atc: 0, purchases: 0, quality: 0,
      };
      entry.sessions++;
      if (
        !(s as any).is_bot &&
        num((s as any).duration_seconds, 0) >= 10 &&
        num((s as any).page_views, 0) >= 2
      ) entry.quality++;
      segMap.set(k, entry);
    }
    const segRows = Array.from(segMap.values()).map(v => ({
      run_id: runId,
      source: v.source, medium: v.medium, campaign: v.campaign,
      country: v.country, device: v.device,
      sessions: v.sessions, pdp_views: v.pdp, add_to_carts: v.atc, purchases: v.purchases,
      traffic_quality_score: v.sessions ? Math.round((v.quality / v.sessions) * 100) : 0,
      conversion_pct: v.sessions ? Math.round((v.purchases / v.sessions) * 10000) / 100 : 0,
      mismatch_pct: 0,
    }));
    if (segRows.length) await admin.from("conversion_reality_segments").insert(segRows);

    // ── Auto-incidents ────────────────────────────────────────────────
    const openIncident = async (
      category: string, severity: string, title: string, evidence: Record<string, unknown>,
    ) => {
      try {
        await admin.from("cie_incidents").insert({
          category, severity, status: "open", title, evidence,
        });
      } catch (e) {
        console.error("[CRA] incident insert failed:", e);
      }
    };
    if (atc >= 5 && beginCheckouts === 0) {
      await openIncident("conversion_reality", "high",
        `ATC=${atc} but begin_checkout=0 in last ${windowHours}h`,
        { atc, beginCheckouts });
    }
    if (pdpViews >= 30 && atc === 0) {
      await openIncident("conversion_reality", "high",
        `PDP views=${pdpViews} but no add_to_cart`,
        { pdpViews, atc });
    }
    // Median session duration <3s.
    const durations = sessions
      .map(s => num((s as any).duration_seconds, 0))
      .sort((a, b) => a - b);
    const median = durations.length ? durations[Math.floor(durations.length / 2)] : 0;
    if (sessionsTotal >= 20 && median < 3) {
      await openIncident("traffic_quality", "medium",
        `Median session duration ${median}s across ${sessionsTotal} sessions`,
        { median, sessions: sessionsTotal });
    }
    // Paid traffic arriving as direct.
    const paidLikeDirect = sessions.filter(s => {
      const src = String((s as any).source || (s as any).utm_source || "").toLowerCase();
      const med = String((s as any).medium || (s as any).utm_medium || "").toLowerCase();
      return (src === "direct" || src === "") && (med === "" || med === "none");
    }).length;
    if (sessionsTotal >= 50 && paidLikeDirect / sessionsTotal > 0.2) {
      await openIncident("attribution", "medium",
        `${Math.round((paidLikeDirect / sessionsTotal) * 100)}% of sessions arriving without UTM`,
        { paidLikeDirect, sessionsTotal });
    }

    return new Response(
      JSON.stringify({
        ok: true, runId, windowHours,
        metrics: {
          sessions: sessionsTotal, pageviews: pageviewsTotal, pdpViews, atc,
          beginCheckouts, purchases, revenue: Number(revenue.toFixed(2)),
          trafficQuality, mismatchPct, pdpConvPct, checkoutStartPct,
        },
        topLeakingProducts: productRows.slice(0, 10),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    console.error("[CRA] failure:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});