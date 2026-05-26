import "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZONES: Array<{ tz: string; offset: number }> = [
  { tz: "America/New_York", offset: -5 },
  { tz: "America/Chicago", offset: -6 },
  { tz: "America/Los_Angeles", offset: -8 },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Use funnel events as hour-of-day proxy when analytics lack hour granularity
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: ev } = await sb
      .from("pinterest_funnel_events")
      .select("pin_id,occurred_at,event_name")
      .gte("occurred_at", since)
      .limit(20000);
    const { data: dims } = await sb.from("pinterest_pin_dimensions").select("pin_id,category_key");
    const cat = new Map<string, string>();
    for (const d of (dims ?? []) as { pin_id: string; category_key: string | null }[]) {
      if (d.category_key) cat.set(d.pin_id, d.category_key);
    }
    const counts = new Map<string, number>(); // key: category|tz|hour
    for (const e of (ev ?? []) as { pin_id: string; occurred_at: string; event_name: string }[]) {
      const c = cat.get(e.pin_id) ?? "unknown";
      const utcHour = new Date(e.occurred_at).getUTCHours();
      for (const z of ZONES) {
        const h = (utcHour + z.offset + 24) % 24;
        const k = `${c}|${z.tz}|${h}`;
        counts.set(k, (counts.get(k) ?? 0) + (e.event_name === "purchase" ? 5 : e.event_name === "add_to_cart" ? 2 : 1));
      }
    }
    const rows = [...counts.entries()].map(([k, v]) => {
      const [category_key, timezone, hour] = k.split("|");
      return { category_key, timezone, hour_of_day: Number(hour), score: v, sample_size: v, computed_at: new Date().toISOString() };
    });
    if (rows.length) await sb.from("pinterest_posting_windows").upsert(rows, { onConflict: "category_key,timezone,hour_of_day" });
    return new Response(JSON.stringify({ ok: true, traceId, rows: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (e as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});