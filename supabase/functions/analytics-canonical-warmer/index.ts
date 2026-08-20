// analytics-canonical-warmer — keeps the admin Visitor World Map fast.
//
// pg_cron calls this with the internal function secret and a `tier`. Each tier
// has its own cron schedule so a slow/failing long window can never delay or
// block the hot (1h/24h/7d) refreshes:
//
//   hot (1h, 24h, 7d)  — every  5 min
//   d14 (14d)          — every 10 min
//   d30 (30d)          — every 15 min
//   d90 (90d)          — every 30 min
//
// Cadence is inversely proportional to compute cost: long windows scan far
// more rows, and their numbers move proportionally slower, so a longer lag is
// both cheaper and analytically harmless. Combos inside a tier run strictly
// sequentially (US after all) — parallel rebuilds would multiply DB load,
// which is exactly the saturation this warmer exists to avoid. Single-flight
// locking in `analytics-canonical` prevents overlapping builds of the same key
// when a run outlives its interval.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { combosForTier, WARMER_TIERS, type WarmerTier } from "../_shared/analyticsWindows.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
// Dedicated cron credential. pg_cron cannot read edge-function env vars, so the
// same value also lives in the `app.analytics_warmer_secret` database GUC and is
// injected by the cron command. Kept separate from INTERNAL_FUNCTION_SECRET so a
// rotation here never breaks the other internal callers. Never logged.
const WARMER_SECRET = Deno.env.get("ANALYTICS_WARMER_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const provided = req.headers.get("x-internal-secret") ?? "";
  // Constant set of accepted credentials; an empty/missing header can never match
  // because empty candidates are filtered out first.
  const accepted = [INTERNAL_SECRET, WARMER_SECRET].filter((s) => s.length > 0);
  if (!provided || !accepted.includes(provided)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // analytics-canonical only accepts INTERNAL_FUNCTION_SECRET, so the warmer always
  // uses that for its downstream calls regardless of which credential authorised it.
  if (!INTERNAL_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: "internal_secret_unconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  let body: Record<string, unknown> | null = null;
  if (req.method === "POST") { try { body = await req.json(); } catch { body = null; } }

  // Single-combo mode. A whole tier can cost several minutes of sequential
  // compute — more than the edge background budget — so cron now schedules one
  // invocation per (hours, geo) combo and each run refreshes exactly one key.
  // Tier mode is kept for manual/legacy calls.
  const rawHours = body?.hours ?? url.searchParams.get("hours");
  const rawGeo = String(body?.geo ?? url.searchParams.get("geo") ?? "").trim();
  const singleHours = rawHours == null || rawHours === "" ? null : Number(rawHours);
  if (singleHours != null) {
    if (!Number.isFinite(singleHours) || singleHours <= 0 || (rawGeo !== "US" && rawGeo !== "all")) {
      return new Response(
        JSON.stringify({ ok: false, error: "invalid hours/geo", hours: rawHours, geo: rawGeo }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }
  const requested = String(body?.tier ?? url.searchParams.get("tier") ?? "hot").toLowerCase();
  if (!WARMER_TIERS.includes(requested as WarmerTier)) {
    return new Response(
      JSON.stringify({ ok: false, error: `unknown tier "${requested}"`, allowed: WARMER_TIERS }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const tier = requested as WarmerTier;

  const combos = singleHours != null
    ? [{ hours: singleHours, geo: rawGeo as "US" | "all" }]
    : null;

  const run = async () => {
    const results: Array<Record<string, unknown>> = [];
    for (const combo of combos ?? combosForTier(tier)) {
      const started = Date.now();
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/analytics-canonical`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_SECRET },
          body: JSON.stringify({ ...combo, envelope: "v2", refresh: true }),
        });
        const ok = res.ok;
        const bodyText = ok ? "" : await res.text();
        results.push({ ...combo, status: res.status, ok, ms: Date.now() - started, error: ok ? null : bodyText.slice(0, 300) });
        if (!ok) console.error(`[warmer:${tier}] ${combo.hours}h/${combo.geo} failed [${res.status}]: ${bodyText}`);
        else console.log(`[warmer:${tier}] ${combo.hours}h/${combo.geo} ok in ${Date.now() - started}ms`);
      } catch (e) {
        // Never abort the tier: one failed combo must not starve the others.
        results.push({ ...combo, ok: false, ms: Date.now() - started, error: (e as Error).message });
        console.error(`[warmer:${tier}] ${combo.hours}h/${combo.geo} threw`, (e as Error).message);
      }
    }
    return results;
  };

  // A full tier costs far more than the 150s request budget (a single cold long
  // window can take minutes), so the caller is answered immediately and the
  // sequential refresh continues as a background task. Cron only needs to know the
  // run was accepted; per-combo outcomes go to the function logs. `sync: true`
  // keeps the blocking behaviour for manual canary runs on cheap tiers.
  if (body?.sync === true) {
    const results = await run();
    return new Response(
      JSON.stringify({ ok: true, tier, mode: "sync", refreshed: results, generated_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // @ts-ignore EdgeRuntime is provided by the Supabase edge runtime.
  EdgeRuntime.waitUntil(run());
  return new Response(
    JSON.stringify({ ok: true, tier, mode: "background", accepted_at: new Date().toISOString() }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
