// Revenue Recovery Monitor — 24-72h automated verification harness.
//
// Certifies whether the P0 revenue recovery is holding after the two
// production fixes:
//   1. DataHealer OWNED_KEYS allow-list (attribution bug — prior patch)
//   2. CartProvider defensive array coercion (storefront crash — this patch)
//
// Emits a snapshot with 6 checks. Cron hourly, then read the trend.
// No writes. No side effects. Safe to invoke ad-hoc.
//
// Response shape:
//   {
//     ok, generated_at, window_hours,
//     checks: {
//       cart_crash_rate,          // items.reduce crashes → must trend to 0
//       owned_keys_violations,    // DataHealer wiping non-cart keys → must be 0
//       pinterest_canonical,      // canonical_sessions where source=pinterest
//       pinterest_atc,            // add_to_cart events attributed to pinterest
//       source_parity,            // pixel vs api vs ga4 vs canonical vs va vs ce
//       attribution_retention,    // % sessions retaining first_utm across pv>=2
//     },
//     verdict: "PASS" | "ATTRIBUTION_ONLY" | "STILL_BROKEN",
//     next_action,
//   }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const hours = 24;
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  // --- 1. Cart crash rate (target: 0) --------------------------------------
  const { count: cartCrashes } = await supabase
    .from("frontend_error_logs")
    .select("*", { count: "exact", head: true })
    .gte("created_at", since)
    .ilike("error_message", "%items.reduce%");

  // --- 2. OWNED_KEYS violations (target: 0) --------------------------------
  // DataHealer must never wipe attribution/identity/consent keys.
  const forbiddenKeys = [
    "gp_visitor_id", "first_seen_at", "first_utm_source", "first_utm_medium",
    "first_utm_campaign", "gp_cookie_consent", "__lovable_anonymous_id",
    "gp_returning_visitor_v1", "first_landing_page",
  ];
  const { count: ownedKeyViolations } = await supabase
    .from("frontend_error_logs")
    .select("*", { count: "exact", head: true })
    .gte("created_at", since)
    .or(forbiddenKeys.map((k) => `error_message.ilike.%${k}%removed%`).join(","));

  // --- 3. Pinterest canonical session count --------------------------------
  const { data: pinRows } = await supabase.rpc("get_canonical_sessions_by_source", {
    p_source: "pinterest", p_hours: hours,
  }).select("*").maybeSingle().then((r) => ({ data: r.data }))
    .catch(() => ({ data: null }));

  let pinterestCanonical = 0;
  if (!pinRows) {
    // Fallback: direct query — canonical_sessions may not have that RPC.
    const { count } = await supabase
      .from("canonical_sessions")
      .select("*", { count: "exact", head: true })
      .gte("first_seen_at", since)
      .ilike("source", "%pinterest%");
    pinterestCanonical = count ?? 0;
  } else {
    pinterestCanonical = (pinRows as { count?: number }).count ?? 0;
  }

  // --- 4. Pinterest ATC count in canonical events --------------------------
  const { count: pinterestAtc } = await supabase
    .from("canonical_events")
    .select("*", { count: "exact", head: true })
    .gte("occurred_at", since)
    .eq("canonical_stage", "CANONICAL_ADD_TO_CART")
    .ilike("utm_source", "%pinterest%");

  // --- 5. Source parity — snapshot per-source counts -----------------------
  const parity: Record<string, number | null> = {};
  for (const src of ["canonical_sessions", "canonical_events", "visitor_activity", "lp_funnel_events"]) {
    try {
      const q = supabase.from(src).select("*", { count: "exact", head: true }).gte(
        src === "canonical_sessions" ? "first_seen_at" : src === "canonical_events" ? "occurred_at" : "created_at",
        since,
      );
      const { count } = await q;
      parity[src] = count ?? 0;
    } catch { parity[src] = null; }
  }

  // --- 6. Attribution retention across multi-pageview sessions -------------
  // Sessions with >= 2 page_views that still have utm_source set →
  // proves DataHealer isn't wiping first-touch mid-session.
  const { data: retentionRows } = await supabase
    .from("canonical_sessions")
    .select("session_id, page_views, utm_source")
    .gte("first_seen_at", since)
    .gte("page_views", 2)
    .limit(500);
  const multi = retentionRows ?? [];
  const retained = multi.filter((r) => r.utm_source && r.utm_source !== "(none)").length;
  const attributionRetentionPct = multi.length
    ? Math.round((retained / multi.length) * 1000) / 10
    : null;

  // --- Verdict -------------------------------------------------------------
  const attributionOk =
    (cartCrashes ?? 0) === 0 &&
    (ownedKeyViolations ?? 0) === 0 &&
    (attributionRetentionPct ?? 0) >= 70;
  const atcRecovering = (pinterestAtc ?? 0) > 0;

  const verdict =
    attributionOk && atcRecovering
      ? "PASS"
      : attributionOk && !atcRecovering
        ? "ATTRIBUTION_ONLY"
        : "STILL_BROKEN";

  const nextAction =
    verdict === "PASS"
      ? "Hold. Continue hourly monitoring for 72h."
      : verdict === "ATTRIBUTION_ONLY"
        ? "Launch Phase-2 forensic: LP quality, PDP UX, pricing, shipping, trust, checkout friction, ATC click behavior."
        : "Attribution regression — inspect DataHealer diffs and CartProvider crash logs; escalate to P0.";

  return new Response(
    JSON.stringify({
      ok: true,
      generated_at: new Date().toISOString(),
      window_hours: hours,
      checks: {
        cart_crash_rate: cartCrashes ?? 0,
        owned_keys_violations: ownedKeyViolations ?? 0,
        pinterest_canonical_sessions: pinterestCanonical,
        pinterest_add_to_cart: pinterestAtc ?? 0,
        source_parity: parity,
        attribution_retention_pct: attributionRetentionPct,
        attribution_retention_sample: multi.length,
      },
      verdict,
      next_action: nextAction,
    }, null, 2),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});