// cinematic-performance-ingest (v5)
//
// Pulls latest per-pin metrics from cinematic_pin_performance and upserts a
// composite-scored row into cinematic_performance_signals. Run every 30 min.
//
// composite = 0.35*ctr + 0.25*save + 0.20*hold + 0.10*completion + 0.10*atc
//
// Auth: service role (cron). Idempotent on (job_id, pin_id).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const trace = () => `ping_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Pull last 14 days of perf rows, group by (job_id, pin_id) latest snapshot
    const since = new Date(Date.now() - 14 * 86400000).toISOString();
    const { data: rows, error } = await admin
      .from("cinematic_pin_performance")
      .select("job_id, pin_id, outbound_ctr, save_rate, hold_rate, completion_rate, add_to_cart_rate, updated_at")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(2000);
    if (error) return json(500, { ok: false, traceId, message: error.message });

    const latest = new Map<string, any>();
    for (const r of rows ?? []) {
      const key = `${r.job_id ?? ""}|${r.pin_id ?? ""}`;
      if (!latest.has(key)) latest.set(key, r);
    }

    let upserted = 0;
    for (const r of latest.values()) {
      const ctr = num(r.outbound_ctr);
      const save = num(r.save_rate);
      const hold = num(r.hold_rate);
      const comp = num(r.completion_rate);
      const atc = num(r.add_to_cart_rate);
      const composite = +(0.35 * ctr + 0.25 * save + 0.20 * hold + 0.10 * comp + 0.10 * atc).toFixed(4);

      const { error: upErr } = await admin
        .from("cinematic_performance_signals")
        .upsert({
          job_id: r.job_id ?? null,
          pin_id: r.pin_id ?? null,
          outbound_ctr: ctr,
          save_rate: save,
          hold_rate: hold,
          completion_rate: comp,
          add_to_cart_rate: atc,
          composite_score: composite,
          window_days: 14,
          updated_at: new Date().toISOString(),
        }, { onConflict: "job_id,pin_id" });
      if (!upErr) upserted++;
    }

    return json(200, { ok: true, traceId, scanned: rows?.length ?? 0, upserted });
  } catch (e) {
    return json(500, { ok: false, traceId, message: e instanceof Error ? e.message : String(e) });
  }
});