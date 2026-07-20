// Wave B — AI Conversion Forensics Engine
// Aggregates per-session forensics into ranked exit-reason findings.
// Runs on-demand (admin) and hourly (cron). Read-only: never mutates
// business data. Writes only to revenue_root_cause_runs / findings.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

type Session = {
  session_id: string;
  entry_page: string | null;
  utm_source: string | null;
  country: string | null;
  device: string | null;
  browser: string | null;
  product_id: string | null;
  product_name: string | null;
  time_on_site_seconds: number | null;
  max_scroll_depth: number | null;
  rage_clicks: number;
  dead_clicks: number;
  cart_opened: boolean;
  checkout_started: boolean;
  purchased: boolean;
  exit_reason: string;
  first_seen_at: string;
};

type Quality = {
  session_id: string;
  product_interactions: number | null;
  cart_interactions: number | null;
  checkout_interactions: number | null;
  variant_selections: number | null;
  zoom_uses: number | null;
  image_gallery_uses: number | null;
  search_uses: number | null;
  menu_uses: number | null;
  shipping_estimator_uses: number | null;
  time_on_page_ms: number | null;
};

// Primary exit-reason taxonomy (must match UI + memory).
type Reason =
  | "purchased"
  | "javascript_error"
  | "rage_click"
  | "dead_click"
  | "checkout_friction"
  | "payment_fail"
  | "shipping_or_price_concern"
  | "price_shock_or_trust"
  | "cta_below_fold_or_mismatch"
  | "landing_mismatch"
  | "navigation_confusion"
  | "no_interaction"
  | "slow_loading"
  | "unknown";

function classify(s: Session, q?: Quality): Reason {
  if (s.purchased) return "purchased";
  if (s.exit_reason === "payment_fail") return "payment_fail";
  if (s.checkout_started) return "checkout_friction";
  if (s.rage_clicks >= 1) return "rage_click";
  if (s.dead_clicks >= 1) return "dead_click";
  if (s.cart_opened) return "shipping_or_price_concern";

  const scroll = s.max_scroll_depth ?? 0;
  const time = s.time_on_site_seconds ?? 0;
  const productViewed = !!s.product_id || (q?.product_interactions ?? 0) > 0;

  if (productViewed && scroll >= 75) return "price_shock_or_trust";
  if (productViewed && scroll < 25) return "cta_below_fold_or_mismatch";
  if (!productViewed && time < 10) return "landing_mismatch";
  if (!productViewed && time >= 30 && (q?.menu_uses ?? 0) + (q?.search_uses ?? 0) >= 2)
    return "navigation_confusion";
  if (time < 3) return "no_interaction";
  return "unknown";
}

function confidence(n: number): number {
  return Math.max(0, Math.min(100, Math.floor(Math.sqrt(n) * 15)));
}

const REASON_REPAIR: Record<Reason, { repair: string; auto_fixable: boolean }> = {
  purchased: { repair: "n/a", auto_fixable: false },
  javascript_error: { repair: "Fix runtime error surfaced in frontend_error_logs.", auto_fixable: false },
  rage_click: { repair: "Investigate element under rage click coordinates — likely broken/unclickable control.", auto_fixable: false },
  dead_click: { repair: "Element receives clicks but has no handler — add click target or remove affordance.", auto_fixable: false },
  checkout_friction: { repair: "Reduce checkout fields; expose delivery/refund reassurance and express-pay above the fold.", auto_fixable: false },
  payment_fail: { repair: "Payment intent failed — check Stripe declines + Apple Pay eligibility on device.", auto_fixable: false },
  shipping_or_price_concern: { repair: "Show shipping cost + delivery ETA before cart; add trust strip on cart.", auto_fixable: false },
  price_shock_or_trust: { repair: "Add review count, comparable-price anchor, and money-back badge to PDP.", auto_fixable: false },
  cta_below_fold_or_mismatch: { repair: "Move primary CTA above the fold and match landing headline to Pinterest hook.", auto_fixable: false },
  landing_mismatch: { repair: "Rewrite landing headline to match ad creative promise; audit Pinterest pin → LP alignment.", auto_fixable: false },
  navigation_confusion: { repair: "Add clear category hero + top-3 collections above the fold.", auto_fixable: false },
  no_interaction: { repair: "Test as bot false-positive; if human, page is loading blank or CTA invisible on device.", auto_fixable: false },
  slow_loading: { repair: "Compress hero image, preload LCP, defer non-critical JS.", auto_fixable: false },
  unknown: { repair: "Insufficient signal to attribute — expand instrumentation.", auto_fixable: false },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const start = Date.now();
  const url = new URL(req.url);
  const hours = Math.max(1, Math.min(720, Number(url.searchParams.get("hours") ?? 24)));
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  // 1. Load sessions
  const { data: sessions, error: sErr } = await supabase
    .from("session_forensics_human")
    .select(
      "session_id,entry_page,utm_source,country,device,browser,product_id,product_name,time_on_site_seconds,max_scroll_depth,rage_clicks,dead_clicks,cart_opened,checkout_started,purchased,exit_reason,first_seen_at",
    )
    .gte("first_seen_at", since)
    .limit(10_000);
  if (sErr) {
    return new Response(JSON.stringify({ ok: false, error: sErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const rows = (sessions ?? []) as Session[];

  // 2. Load quality signals
  const ids = rows.map((r) => r.session_id);
  const qMap = new Map<string, Quality>();
  if (ids.length) {
    const { data: q } = await supabase
      .from("analytics_session_quality")
      .select(
        "session_id,product_interactions,cart_interactions,checkout_interactions,variant_selections,zoom_uses,image_gallery_uses,search_uses,menu_uses,shipping_estimator_uses,time_on_page_ms",
      )
      .in("session_id", ids);
    (q ?? []).forEach((x) => qMap.set(x.session_id, x as Quality));
  }

  // 3. Baseline economics
  const { data: orderRows } = await supabase
    .from("orders")
    .select("total_amount")
    .in("status", ["paid", "completed"])
    .gte("created_at", new Date(Date.now() - 90 * 86400_000).toISOString());
  const actualAov =
    orderRows && orderRows.length
      ? Math.round(orderRows.reduce((a, o: any) => a + Number(o.total_amount ?? 0), 0) / orderRows.length)
      : 0;
  const baseline_aov_cents = Math.max(actualAov, 3500);
  const baseline_cvr = 0.02;

  // 4. Classify
  const classified = rows.map((r) => ({ row: r, reason: classify(r, qMap.get(r.session_id)) }));
  const totalSessions = classified.length;
  const totalPurchases = classified.filter((c) => c.reason === "purchased").length;

  // 5. Insert run header
  const { data: runRow, error: runErr } = await supabase
    .from("revenue_root_cause_runs")
    .insert({
      window_hours: hours,
      total_sessions: totalSessions,
      total_purchases: totalPurchases,
      baseline_aov_cents,
      baseline_cvr,
      ok: true,
      duration_ms: 0,
    })
    .select("run_id")
    .single();
  if (runErr || !runRow) {
    return new Response(JSON.stringify({ ok: false, error: runErr?.message ?? "run insert failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const run_id = runRow.run_id as string;

  // 6. Build findings across multiple dimensions
  type Bucket = { key: string; sessions: number; reason: string; extra?: Record<string, unknown> };
  const findings: any[] = [];

  function push(finding_type: string, buckets: Bucket[]) {
    buckets
      .filter((b) => b.sessions >= 3) // hard min-sample floor
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 20)
      .forEach((b, idx) => {
        const pct = totalSessions ? (b.sessions / totalSessions) * 100 : 0;
        const est = Math.round(b.sessions * baseline_cvr * baseline_aov_cents);
        const conf = confidence(b.sessions);
        const meta = REASON_REPAIR[(b.reason as Reason) ?? "unknown"] ?? REASON_REPAIR.unknown;
        findings.push({
          run_id,
          rank: idx + 1,
          finding_type,
          dimension_value: b.key,
          exit_reason: b.reason,
          sessions: b.sessions,
          pct_of_total: Number(pct.toFixed(3)),
          est_revenue_loss_cents: est,
          confidence: conf,
          evidence: { ...(b.extra ?? {}), window_hours: hours },
          suggested_repair: meta.repair,
          auto_fixable: meta.auto_fixable,
        });
      });
  }

  const byReason = new Map<string, number>();
  const byLanding = new Map<string, { n: number; reasons: Record<string, number> }>();
  const byProduct = new Map<string, { n: number; name: string; reasons: Record<string, number> }>();
  const byDevice = new Map<string, { n: number; reasons: Record<string, number> }>();
  const byCountry = new Map<string, { n: number; reasons: Record<string, number> }>();
  const bySource = new Map<string, { n: number; reasons: Record<string, number> }>();
  const byBrowser = new Map<string, { n: number; reasons: Record<string, number> }>();

  function bump<T extends { n: number; reasons: Record<string, number> }>(
    map: Map<string, T>,
    key: string | null,
    reason: string,
    factory: () => T,
  ) {
    if (!key) return;
    let v = map.get(key);
    if (!v) {
      v = factory();
      map.set(key, v);
    }
    v.n++;
    v.reasons[reason] = (v.reasons[reason] ?? 0) + 1;
  }

  for (const c of classified) {
    if (c.reason === "purchased") continue; // findings are about lost sales
    byReason.set(c.reason, (byReason.get(c.reason) ?? 0) + 1);
    bump(byLanding, c.row.entry_page, c.reason, () => ({ n: 0, reasons: {} }));
    bump(byDevice, c.row.device, c.reason, () => ({ n: 0, reasons: {} }));
    bump(byCountry, c.row.country, c.reason, () => ({ n: 0, reasons: {} }));
    bump(bySource, c.row.utm_source, c.reason, () => ({ n: 0, reasons: {} }));
    bump(byBrowser, c.row.browser, c.reason, () => ({ n: 0, reasons: {} }));
    if (c.row.product_id) {
      let v = byProduct.get(c.row.product_id);
      if (!v) {
        v = { n: 0, name: c.row.product_name ?? c.row.product_id, reasons: {} };
        byProduct.set(c.row.product_id, v);
      }
      v.n++;
      v.reasons[c.reason] = (v.reasons[c.reason] ?? 0) + 1;
    }
  }

  const topReason = (r: Record<string, number>) =>
    Object.entries(r).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

  push(
    "exit_reason",
    Array.from(byReason.entries()).map(([reason, n]) => ({ key: reason, reason, sessions: n })),
  );
  push(
    "landing_page",
    Array.from(byLanding.entries()).map(([k, v]) => ({
      key: k,
      reason: topReason(v.reasons),
      sessions: v.n,
      extra: { reasons: v.reasons },
    })),
  );
  push(
    "product",
    Array.from(byProduct.entries()).map(([k, v]) => ({
      key: k,
      reason: topReason(v.reasons),
      sessions: v.n,
      extra: { product_name: v.name, reasons: v.reasons },
    })),
  );
  push(
    "device",
    Array.from(byDevice.entries()).map(([k, v]) => ({
      key: k,
      reason: topReason(v.reasons),
      sessions: v.n,
      extra: { reasons: v.reasons },
    })),
  );
  push(
    "country",
    Array.from(byCountry.entries()).map(([k, v]) => ({
      key: k,
      reason: topReason(v.reasons),
      sessions: v.n,
      extra: { reasons: v.reasons },
    })),
  );
  push(
    "utm_source",
    Array.from(bySource.entries()).map(([k, v]) => ({
      key: k,
      reason: topReason(v.reasons),
      sessions: v.n,
      extra: { reasons: v.reasons },
    })),
  );
  push(
    "browser",
    Array.from(byBrowser.entries()).map(([k, v]) => ({
      key: k,
      reason: topReason(v.reasons),
      sessions: v.n,
      extra: { reasons: v.reasons },
    })),
  );

  if (findings.length) {
    const { error: fErr } = await supabase.from("revenue_root_cause_findings").insert(findings);
    if (fErr) {
      return new Response(JSON.stringify({ ok: false, error: fErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const est_monthly_recoverable_cents = findings
    .filter((f) => f.finding_type === "exit_reason")
    .reduce((a, f) => a + Number(f.est_revenue_loss_cents), 0) *
    Math.round((30 * 24) / hours);

  const duration_ms = Date.now() - start;
  await supabase.from("revenue_root_cause_runs").update({ duration_ms }).eq("run_id", run_id);

  return new Response(
    JSON.stringify({
      ok: true,
      run_id,
      window_hours: hours,
      total_sessions: totalSessions,
      total_purchases: totalPurchases,
      baseline_aov_cents,
      baseline_cvr,
      findings_count: findings.length,
      est_monthly_recoverable_cents,
      duration_ms,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});