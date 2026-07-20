import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const since = new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString();

  const { data: events, error } = await supabase
    .from("arie_funnel_events")
    .select("session_id,visitor_id,stage,ts,source,campaign,creative_id,pin_id,tiktok_video_id,device,country,value_cents")
    .gte("ts", since)
    .order("ts", { ascending: true })
    .limit(50000);
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const bySession = new Map<string, any[]>();
  for (const e of events ?? []) {
    const list = bySession.get(e.session_id) ?? [];
    list.push(e);
    bySession.set(e.session_id, list);
  }

  const rows: any[] = [];
  for (const [sid, list] of bySession) {
    const stages = Array.from(new Set(list.map((x: any) => x.stage)));
    const first = list[0];
    const last = list[list.length - 1];
    const purchase = list.find((x: any) => x.stage === "purchase");
    const purchaseTs = purchase ? new Date(purchase.ts).getTime() : null;
    const firstTs = new Date(first.ts).getTime();
    rows.push({
      session_id: sid,
      visitor_id: first.visitor_id,
      first_touch: first.ts,
      last_touch: last.ts,
      stages_reached: stages,
      time_to_purchase_ms: purchaseTs ? purchaseTs - firstTs : null,
      revenue_cents: list.filter((x: any) => x.stage === "purchase").reduce((s: number, x: any) => s + (x.value_cents || 0), 0),
      source: first.source,
      campaign: first.campaign,
      creative_id: first.creative_id,
      pin_id: first.pin_id,
      tiktok_video_id: first.tiktok_video_id,
      device: first.device,
      country: first.country,
      attribution: {
        first_touch: { source: first.source, campaign: first.campaign },
        last_touch: { source: last.source, campaign: last.campaign },
      },
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length) {
    const { error: upErr } = await supabase
      .from("arie_sessions")
      .upsert(rows, { onConflict: "session_id" });
    if (upErr) {
      return new Response(JSON.stringify({ ok: false, error: upErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, stitched: rows.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});