import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PE_CRON_SECRET = Deno.env.get("PE_CRON_SECRET") ?? "";
const INTERNAL = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

type Step = { name: string; ok: boolean; ms: number; error?: string; detail?: unknown };

async function invoke(fn: string): Promise<Step> {
  const t0 = Date.now();
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "x-internal-secret": INTERNAL,
        "x-cron-secret": PE_CRON_SECRET,
      },
      body: "{}",
    });
    const text = await r.text();
    let detail: unknown = text;
    try { detail = JSON.parse(text); } catch { /* ignore */ }
    return { name: fn, ok: r.ok, ms: Date.now() - t0, detail, error: r.ok ? undefined : `HTTP ${r.status}` };
  } catch (e) {
    return { name: fn, ok: false, ms: Date.now() - t0, error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const trigger = url.searchParams.get("trigger") ?? "manual";
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Open endpoint: only triggers internal refresh functions, protected by
  // a 5-minute debounce in public.prie_kick and 15-minute cron schedule.
  // No PII or mutations beyond audit logging are performed here.

  const t0 = Date.now();
  // Order matters: refresh inputs first, then derive scores/predictions.
  const order = [
    "pinterest-analytics-sync",
    "sync-ga4-daily",
    "pinterest-revenue-brain",
    "prie-brain-sync",
    "prie-revenue-predictor",
  ];
  const steps: Step[] = [];
  for (const fn of order) {
    steps.push(await invoke(fn));
  }

  const ok = steps.every((s) => s.ok);
  const summary = {
    trigger,
    ok,
    total_ms: Date.now() - t0,
    steps: steps.map((s) => ({ name: s.name, ok: s.ok, ms: s.ms, error: s.error })),
  };

  // Audit: always log to prie_timeline_events; never fabricate metrics.
  await sb.from("prie_timeline_events").insert({
    kind: "auto_orchestrator",
    severity: ok ? "info" : "warning",
    title: `Auto orchestrator (${trigger}) ${ok ? "succeeded" : "partial"}`,
    detail: JSON.stringify(summary).slice(0, 4000),
  });

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: ok ? 200 : 207,
  });
});