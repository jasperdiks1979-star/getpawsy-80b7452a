import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { nextRetryAt, MAX_RETRY_ATTEMPTS } from "../_shared/pipeline-health.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RETRY_FN_MAP: Record<string, string> = {
  cinematic_ad_autopublish: "cinematic-ad-autopublish",
  pinterest_video_publisher: "pinterest-video-publisher",
  pinterest_pipeline_drain: "pinterest-pipeline-drain",
  pinterest_regen_autopilot: "pinterest-regen-autopilot",
  pinterest_pin_creator: "pinterest-pin-creator",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const now = new Date().toISOString();
    const { data: rows } = await sb
      .from("pinterest_pipeline_failures")
      .select("id, source, job_type, job_id, attempt, meta")
      .is("resolved_at", null)
      .lte("next_retry_at", now)
      .order("created_at", { ascending: true })
      .limit(50);

    let retried = 0, resolved = 0, escalated = 0;
    for (const r of (rows ?? []) as any[]) {
      const nextAttempt = (r.attempt ?? 0) + 1;
      const fn = RETRY_FN_MAP[r.job_type] ?? null;
      let ok = false;
      if (fn) {
        try {
          const { error } = await sb.functions.invoke(fn, { body: { retry_of: r.id, job_id: r.job_id, ...((r.meta ?? {}) as Record<string, unknown>) } });
          ok = !error;
        } catch { ok = false; }
      }
      retried++;

      if (ok) {
        await sb.from("pinterest_pipeline_failures").update({ resolved_at: new Date().toISOString(), attempt: nextAttempt }).eq("id", r.id);
        resolved++;
      } else if (nextAttempt >= MAX_RETRY_ATTEMPTS) {
        await sb.from("pinterest_pipeline_failures").update({ attempt: nextAttempt, next_retry_at: null, escalated_at: new Date().toISOString() }).eq("id", r.id);
        await sb.from("monitoring_alerts").insert({
          severity: "warning",
          source: "pipeline_self_healing",
          title: `Pipeline failure escalated: ${r.source}/${r.job_type}`,
          message: `Job ${r.job_id ?? "n/a"} failed ${nextAttempt} times.`,
          metadata: { failure_id: r.id },
        }).catch(() => {});
        escalated++;
      } else {
        await sb.from("pinterest_pipeline_failures").update({ attempt: nextAttempt, next_retry_at: nextRetryAt(nextAttempt) }).eq("id", r.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, traceId, retried, resolved, escalated }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (err as Error).message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});