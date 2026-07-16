// Read-only run summary — Control 9.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  let run_id = url.searchParams.get("run_id");
  if (!run_id && req.method === "POST") {
    try { run_id = (await req.json())?.run_id ?? null; } catch { /* ignore */ }
  }
  if (!run_id) {
    return new Response(JSON.stringify({ ok: false, reason: "missing_run_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const [{ data: cfg }, { data: ledger }, { data: queue }] = await Promise.all([
    sb.from("pinterest_run_config").select("*").eq("run_id", run_id).maybeSingle(),
    sb.from("pinterest_run_cost_ledger").select("*").eq("run_id", run_id),
    sb.from("pinterest_pin_queue").select("id,status,pinterest_pin_id").eq("run_id", run_id),
  ]);
  if (!cfg) {
    return new Response(JSON.stringify({ ok: false, reason: "run_not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  let credits = 0;
  let image_calls = 0;
  let qa_calls = 0;
  let retries = 0;
  let cached_hits = 0;
  let failed = 0;
  for (const r of ledger ?? []) {
    if (!r.cached_hit) credits += Number(r.credits ?? 0);
    if ((r.operation === "image_gen" || r.operation === "image_edit") && !r.cached_hit) image_calls++;
    if (["qa", "pre", "integrity", "native"].includes(r.operation) && !r.cached_hit) qa_calls++;
    if ((r.retry_number ?? 0) > 0) retries++;
    if (r.cached_hit) cached_hits++;
    if (r.success === false) failed++;
  }
  const published = (queue ?? []).filter((q: any) => q.pinterest_pin_id).length;
  const rejected = (queue ?? []).filter((q: any) =>
    ["rejected", "terminal_rejected", "wave_rejected"].includes(q.status),
  ).length;
  return new Response(
    JSON.stringify({
      ok: true,
      run_id,
      status: cfg.status,
      paused_reason: cfg.paused_reason,
      spend_credits: credits,
      max_credit_spend: cfg.max_credit_spend,
      remaining_budget: Math.max(0, Number(cfg.max_credit_spend) - credits),
      image_calls,
      qa_calls,
      retries,
      cached_hits,
      failed_calls: failed,
      published_pins: published,
      rejected_pins: rejected,
      cost_per_published_pin: published > 0 ? credits / published : null,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});