import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: settings } = await supabase.from("revenue_ai_settings").select("queue_min_video_jobs, queue_min_pins, queue_min_reserve").maybeSingle();
    const minVideo = settings?.queue_min_video_jobs ?? 100;
    const minPin = settings?.queue_min_pins ?? 50;
    const minReserve = settings?.queue_min_reserve ?? 20;

    const [{ count: videoCount }, { count: pinCount }, { count: reserveCount }] = await Promise.all([
      supabase.from("pinterest_video_queue").select("id", { count: "exact", head: true }).in("status", ["queued", "pending", "rendering"]),
      supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).in("status", ["queued", "pending", "ready"]),
      supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "ready"),
    ]);

    const actions: string[] = [];
    if ((videoCount ?? 0) < minVideo) {
      const r = await supabase.functions.invoke("pipeline-auto-replenish", { body: { kind: "video", revenue_priority: true } });
      actions.push(`replenish_video:${r.error ? "fail" : "ok"}`);
    }
    if ((pinCount ?? 0) < minPin || (reserveCount ?? 0) < minReserve) {
      const r = await supabase.functions.invoke("pipeline-auto-replenish", { body: { kind: "pin", revenue_priority: true } });
      actions.push(`replenish_pin:${r.error ? "fail" : "ok"}`);
    }

    return new Response(JSON.stringify({ ok: true, videoCount, pinCount, reserveCount, actions }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});