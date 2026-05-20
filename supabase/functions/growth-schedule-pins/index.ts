import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// US prime-time slots in UTC (ET = UTC-5 during EST, UTC-4 during EDT — we use EST baseline)
// 10:00, 14:00, 19:00, 21:00 ET → 15, 19, 00(+1), 02(+1) UTC
const PRIME_SLOTS_UTC = [15, 19, 24, 26]; // hours from UTC midnight of decision.day; >=24 rolls into next day

function slotToIso(day: string, hourFromMidnight: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCHours(d.getUTCHours() + hourFromMidnight);
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg } = await sb
      .from("growth_autopilot_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (cfg?.emergency_stop) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "Emergency stop active" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (cfg?.paused_publishing) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "Publishing paused" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const cap = Math.min(4, Math.max(1, Number(cfg?.max_pins_per_day ?? 4)));

    const { data: decisions, error } = await sb
      .from("growth_decisions")
      .select("id, day, payload, status, product_id")
      .eq("decision_type", "daily_pick")
      .eq("day", today)
      .eq("status", "approved")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const elig = (decisions ?? []).filter((d) => {
      const p = d.payload as any;
      return p?.cinematic_job_id && !p?.scheduled_at;
    });
    if (elig.length === 0) {
      return new Response(JSON.stringify({ ok: true, traceId, message: "Nothing to schedule" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine free slots (skip ones already used by other decisions today)
    const used = new Set<string>();
    for (const d of decisions ?? []) {
      const s = (d.payload as any)?.scheduled_at;
      if (s) used.add(String(s));
    }
    const candidateSlots = PRIME_SLOTS_UTC.map((h) => slotToIso(today, h)).filter((iso) => !used.has(iso));

    // Enforce 90-min gap by simply ordering and trimming to cap
    const slots = candidateSlots.slice(0, Math.min(cap, candidateSlots.length, elig.length));
    const scheduled: Array<{ decision_id: string; scheduled_at: string; job_id: string }> = [];

    for (let i = 0; i < slots.length; i++) {
      const dec = elig[i];
      const at = slots[i];
      const jobId = (dec.payload as any).cinematic_job_id as string;
      await sb
        .from("growth_decisions")
        .update({ payload: { ...(dec.payload as object), scheduled_at: at } })
        .eq("id", dec.id);
      scheduled.push({ decision_id: dec.id, scheduled_at: at, job_id: jobId });
    }

    await sb.from("growth_events").insert({
      event_type: "pins_scheduled",
      trace_id: traceId,
      payload: { day: today, scheduled, cap },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        message: `Scheduled ${scheduled.length} pin(s) across US prime windows`,
        scheduled,
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