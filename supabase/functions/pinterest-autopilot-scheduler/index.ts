/**
 * pinterest-autopilot-scheduler
 *
 * Cron-friendly tick (every 15 min). When enabled:
 *   1. Generates today's schedule if missing.
 *   2. Returns the list of "due" planned rows for the admin UI / cron to run.
 *
 * It does NOT directly invoke cinematic-ad-autopilot in service mode (that
 * function requires an admin user). Cron is best paired with a small admin
 * worker page calling pinterest-autopilot-run-one, OR a separate scheduled
 * function with admin impersonation. This function is safe to call from cron.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const tid = () => `pap_tick_${crypto.randomUUID().slice(0, 8)}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = tid();
  try {
    // Service-only (called from pg_cron).
    const secret = req.headers.get("x-render-secret") ?? "";
    if (!WORKER_SECRET || secret !== WORKER_SECRET) {
      return json({ ok: false, traceId, message: "unauthorized" }, 401);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: cfg } = await admin.from("pinterest_autopilot_config").select("*").eq("id", 1).maybeSingle();
    if (!cfg?.enabled) return json({ ok: true, traceId, message: "autopilot disabled", enabled: false });

    // Generate today's schedule if needed.
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (cfg.last_schedule_generated_for !== todayUtc) {
      const gen = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-autopilot-generate-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-render-secret": WORKER_SECRET },
        body: "{}",
      });
      const genJson = await gen.json().catch(() => ({}));
      console.log(`[pap-tick] ${traceId} generate response`, { ok: genJson?.ok, msg: genJson?.message });
    }

    // List due rows.
    const { data: due } = await admin
      .from("pinterest_autopilot_schedule")
      .select("id, scheduled_at, product_slug, status")
      .eq("status", "planned")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at")
      .limit(5);

    // Dispatch each due row via pinterest-autopilot-run-one (service secret).
    const dispatched: any[] = [];
    for (const row of due ?? []) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-autopilot-run-one`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-render-secret": WORKER_SECRET },
          body: JSON.stringify({ schedule_id: row.id }),
        });
        const j = await r.json().catch(() => ({}));
        dispatched.push({ id: row.id, ok: !!j?.ok, message: j?.message });
      } catch (e) {
        dispatched.push({ id: row.id, ok: false, message: e instanceof Error ? e.message : String(e) });
      }
    }

    return json({
      ok: true, traceId,
      enabled: true,
      due_now: due ?? [],
      dispatched,
      message: due?.length ? `dispatched ${dispatched.filter(d => d.ok).length}/${due.length} due rows` : "no rows due",
    });
  } catch (e) {
    return json({ ok: false, traceId, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});