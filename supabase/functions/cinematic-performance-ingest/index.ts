// cinematic-performance-ingest (v5)
//
// Pulls latest per-pin metrics from cinematic_pin_performance and upserts a
// composite-scored row into cinematic_performance_signals. Run every 30 min.
//
// composite = renormalised over the metrics that actually have a source.
// Authoritative columns in cinematic_pin_performance: outbound_clicks, saves,
// impressions, watch_seconds_p50, engagement_rate, collected_at.
// hold_rate / completion_rate / add_to_cart_rate have NO reliable source and are
// therefore written as NULL (unavailable) — never as a measured 0.
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
      .select("job_id, pin_id, impressions, outbound_clicks, saves, watch_seconds_p50, engagement_rate, collected_at")
      .gte("collected_at", since)
      .order("collected_at", { ascending: false })
      .limit(2000);
    if (error) return json(500, { ok: false, traceId, stage: "load_performance", message: error.message });

    const latest = new Map<string, any>();
    for (const r of rows ?? []) {
      const key = `${r.job_id ?? ""}|${r.pin_id ?? ""}`;
      if (!latest.has(key)) latest.set(key, r);
    }

    let upserted = 0;
    let unavailable_metrics = 0;
    for (const r of latest.values()) {
      const imp = num(r.impressions);
      // Rates are only meaningful with a non-zero impression base.
      const ctr = imp > 0 ? +(num(r.outbound_clicks) / imp).toFixed(6) : null;
      const save = imp > 0 ? +(num(r.saves) / imp).toFixed(6) : null;
      // No source in this schema — explicitly unavailable, not zero.
      const hold = null;
      const comp = null;
      const atc = null;
      if (ctr === null) unavailable_metrics++;
      const composite = (ctr === null || save === null)
        ? null
        // renormalised over the 0.35 + 0.25 weights that have a real source
        : +(((0.35 * ctr) + (0.25 * save)) / 0.60).toFixed(6);

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
      if (upErr) return json(500, { ok: false, traceId, stage: "upsert_signals", pin_id: r.pin_id, message: upErr.message, upserted });
      upserted++;
    }

    return json(200, {
      ok: true, traceId, scanned: rows?.length ?? 0, upserted,
      pins_without_impression_base: unavailable_metrics,
      unavailable_metrics: ["hold_rate", "completion_rate", "add_to_cart_rate"],
    });
  } catch (e) {
    return json(500, { ok: false, traceId, message: e instanceof Error ? e.message : String(e) });
  }
});