import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg } = await sb
      .from("growth_autopilot_config").select("*").eq("id", 1).maybeSingle();
    if (cfg?.emergency_stop || cfg?.paused_publishing) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "Publishing disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    const since = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);

    const { data: decisions, error } = await sb
      .from("growth_decisions")
      .select("id, day, payload, status")
      .eq("decision_type", "daily_pick")
      .gte("day", since)
      .eq("status", "approved");
    if (error) throw error;

    const due = (decisions ?? []).filter((d) => {
      const p = d.payload as any;
      return p?.cinematic_job_id && p?.scheduled_at && p.scheduled_at <= now && !p?.publish_triggered_at;
    });

    const triggered: Array<{ decision_id: string; job_id: string; ok: boolean; reason?: string }> = [];

    for (const d of due) {
      const p = d.payload as any;
      const jobId = p.cinematic_job_id as string;

      const { data: job } = await sb
        .from("cinematic_ad_jobs")
        .select("id, status, output_mp4_url, vo_url, pin_title, pin_description, validation_report, auto_publish, pinterest_pin_id")
        .eq("id", jobId)
        .maybeSingle();

      if (!job) {
        triggered.push({ decision_id: d.id, job_id: jobId, ok: false, reason: "job missing" });
        continue;
      }
      if (job.pinterest_pin_id) {
        await sb.from("growth_decisions").update({
          payload: { ...p, publish_triggered_at: now, pinterest_pin_id: job.pinterest_pin_id },
        }).eq("id", d.id);
        triggered.push({ decision_id: d.id, job_id: jobId, ok: true, reason: "already published" });
        continue;
      }
      if (!job.output_mp4_url || !job.vo_url || !job.pin_title || !job.pin_description) {
        triggered.push({ decision_id: d.id, job_id: jobId, ok: false, reason: "job not ready" });
        continue;
      }
      const report = job.validation_report as { passed?: boolean } | null;
      if (report && report.passed === false) {
        triggered.push({ decision_id: d.id, job_id: jobId, ok: false, reason: "validation failed" });
        continue;
      }

      if (!job.auto_publish) {
        await sb
          .from("cinematic_ad_jobs")
          .update({ auto_publish: true, status_message: "growth-tick: auto-publish enabled" })
          .eq("id", jobId);
      }

      await sb.from("growth_decisions").update({
        payload: { ...p, publish_triggered_at: now },
      }).eq("id", d.id);

      triggered.push({ decision_id: d.id, job_id: jobId, ok: true });
    }

    await sb.from("growth_events").insert({
      event_type: "publish_tick",
      trace_id: traceId,
      payload: { now, due: due.length, triggered },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        message: `Triggered ${triggered.filter((t) => t.ok).length}/${due.length} due decisions`,
        triggered,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, traceId, message: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});