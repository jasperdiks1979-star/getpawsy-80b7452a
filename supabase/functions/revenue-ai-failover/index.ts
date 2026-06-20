import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const { stage = "ai_render", product_id, job_id, error } = body;
    const ORDER = ["ai_render", "product_video", "cinematic_slideshow", "backup_voice", "requeue"];
    const idx = ORDER.indexOf(stage);
    const nextStage = ORDER[idx + 1] ?? "requeue";

    await supabase.from("pinterest_pipeline_failures").insert({
      source: "render",
      job_type: "revenue_ai_failover",
      job_id: job_id ?? null,
      error_code: stage,
      error_message: typeof error === "string" ? error : JSON.stringify(error ?? null),
      attempt: idx + 1,
      next_retry_at: new Date(Date.now() + 60_000).toISOString(),
    });

    if (nextStage === "product_video" || nextStage === "cinematic_slideshow" || nextStage === "backup_voice") {
      const r = await supabase.functions.invoke("pipeline-emergency-content", { body: { product_id, stage: nextStage } });
      return new Response(JSON.stringify({ ok: true, advanced_to: nextStage, emergency: !r.error }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, advanced_to: nextStage, action: "requeue" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});