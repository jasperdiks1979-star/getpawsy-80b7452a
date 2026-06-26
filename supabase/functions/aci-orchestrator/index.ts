import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Step = { name: string; ok: boolean; ms: number; error?: string };

// Ordered fan-out of EXISTING refresh functions. ACI never calls Pinterest/Ads/GMC directly.
const fanout = [
  "aci-data-source-health",
  "prie-auto-orchestrator",
  "pga-overview-sync",
  "pe-endpoint-matrix",
];

async function invoke(fn: string): Promise<Step> {
  const t0 = Date.now();
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: "{}",
    });
    return { name: fn, ok: r.ok, ms: Date.now() - t0, error: r.ok ? undefined : `HTTP ${r.status}` };
  } catch (e) {
    return { name: fn, ok: false, ms: Date.now() - t0, error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const trigger = url.searchParams.get("trigger") ?? "manual";
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Debounce 5 minutes via aci_audit_log (entity_type='aci_orchestrator_run')
  const { data: lastAudit } = await sb
    .from("aci_audit_log")
    .select("ts")
    .eq("entity_type", "aci_orchestrator_run")
    .order("ts", { ascending: false })
    .limit(1);
  const last = lastAudit?.[0]?.ts ? new Date(lastAudit[0].ts as string).getTime() : 0;
  if (Date.now() - last < 5 * 60_000 && trigger !== "manual" && trigger !== "deploy") {
    return new Response(JSON.stringify({ ok: true, skipped: "debounced" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startedAt = new Date().toISOString();
  const { data: run } = await sb
    .from("aci_runs")
    .insert({ engine: "aci-orchestrator", status: "running", mode: trigger, started_at: startedAt })
    .select("id")
    .single();
  const runId: string | undefined = run?.id;

  const steps: Step[] = [];
  for (const fn of fanout) {
    const s = await invoke(fn);
    steps.push(s);
    if (runId) {
      await sb.from("aci_run_steps").insert({
        run_id: runId,
        step: fn,
        status: s.ok ? "ok" : "error",
        duration_ms: s.ms,
        error: s.error ?? null,
      });
    }
  }

  const ok = steps.every((s) => s.ok);
  if (runId) {
    await sb.from("aci_runs").update({
      status: ok ? "completed" : "partial",
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
  }
  await sb.from("aci_audit_log").insert({
    actor: "system",
    engine: "aci-orchestrator",
    action: ok ? "run_completed" : "run_partial",
    entity_type: "aci_orchestrator_run",
    entity_id: runId ?? null,
    payload: { trigger, steps } as unknown as Record<string, unknown>,
  });

  return new Response(JSON.stringify({ ok, trigger, run_id: runId, steps }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: ok ? 200 : 207,
  });
});