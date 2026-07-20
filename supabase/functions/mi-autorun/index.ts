import { corsHeaders } from "../_shared/cors.ts";

// Orchestrator: runs ingest -> detect -> forecast in sequence.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = crypto.randomUUID();
  const base = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const steps = ["mi-ingest-internal", "mi-detect-opportunities", "mi-forecast-seasonal", "mi-feedback-loop", "mi-rank-next-creatives", "mi-auto-tune", "mi-bulk-variants", "mi-compliance-gate", "mi-promote-recommendations", "mi-budget-allocator", "mi-experiment-autocreate", "mi-experiment-ingest", "mi-experiment-tracker", "mi-tiktok-ingest", "mi-revenue-attribution", "mi-audience-cluster", "mi-bandit-allocator", "mi-budget-shifter", "mi-arm-guardrails", "mi-fatigue-detector", "cta-copy-winner-elector-by-hook"];
  const results: Record<string, any> = {};

  for (const fn of steps) {
    try {
      const r = await fetch(`${base}/functions/v1/${fn}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: "{}",
      });
      const j = await r.json().catch(() => ({}));
      results[fn] = { ok: r.ok, status: r.status, ...j };
    } catch (e: any) {
      results[fn] = { ok: false, error: e?.message ?? String(e) };
    }
  }

  return new Response(JSON.stringify({ ok: true, traceId, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});