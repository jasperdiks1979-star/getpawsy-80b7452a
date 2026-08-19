// analytics-canonical-warmer — keeps the admin Visitor World Map fast.
//
// pg_cron calls this every 5 minutes with the internal function secret. It
// asks `analytics-canonical` to rebuild the hot (hours, geo) combinations and
// persist them into `public.analytics_canonical_cache`, so admin page loads
// read one indexed row instead of re-scanning the whole window.
//
// Max data lag = the cron cadence (5 minutes).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

// Hot combos rendered by /admin/analytics/visitor-world-map-pro.
const COMBOS: Array<{ hours: number; geo: "US" | "all" }> = [
  { hours: 1, geo: "all" },
  { hours: 1, geo: "US" },
  { hours: 24, geo: "all" },
  { hours: 24, geo: "US" },
  { hours: 168, geo: "all" },
  { hours: 168, geo: "US" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const provided = req.headers.get("x-internal-secret") ?? "";
  if (!INTERNAL_SECRET || provided !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<Record<string, unknown>> = [];
  // Sequential on purpose: parallel rebuilds would multiply DB load, which is
  // exactly the saturation this warmer exists to avoid.
  for (const combo of COMBOS) {
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
      if (!ok) console.error(`[warmer] ${combo.hours}h/${combo.geo} failed [${res.status}]: ${bodyText}`);
    } catch (e) {
      results.push({ ...combo, ok: false, ms: Date.now() - started, error: (e as Error).message });
      console.error(`[warmer] ${combo.hours}h/${combo.geo} threw`, (e as Error).message);
    }
  }

  return new Response(JSON.stringify({ ok: true, refreshed: results, generated_at: new Date().toISOString() }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
