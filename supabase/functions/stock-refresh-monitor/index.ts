import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function traceId() {
  return crypto.randomUUID();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const trace = traceId();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Get the most recent active run (not completed)
    const { data: run, error: runErr } = await supabase
      .from("stock_refresh_runs")
      .select("*")
      .is("completed_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runErr) throw runErr;
    if (!run) {
      return new Response(
        JSON.stringify({ ok: true, traceId: trace, message: "No active refresh run" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Count remaining pending_refresh products
    const { count: remaining, error: countErr } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("stock_sync_status", "pending_refresh")
      .eq("is_duplicate", false);

    if (countErr) throw countErr;

    // 3. Count synced ok / error since run start
    const { count: syncedOk } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("stock_sync_status", "ok")
      .gte("last_stock_sync_at", run.started_at);

    const { count: syncedError } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("stock_sync_status", "error")
      .gte("last_stock_sync_at", run.started_at);

    const isComplete = (remaining ?? 0) === 0;
    const update: Record<string, unknown> = {
      remaining: remaining ?? 0,
      synced_ok: syncedOk ?? 0,
      synced_error: syncedError ?? 0,
      last_checked_at: new Date().toISOString(),
    };

    if (isComplete && !run.completed_at) {
      update.completed_at = new Date().toISOString();
    }

    await supabase.from("stock_refresh_runs").update(update).eq("id", run.id);

    // 4. Send notification once when complete
    let notified = false;
    if (isComplete && !run.notified_complete_at) {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "https://getpawsy.pet";
      const notifyEmail = Deno.env.get("ADMIN_NOTIFY_EMAIL") ?? "support@getpawsy.pet";

      if (RESEND_API_KEY) {
        try {
          const durationMs = Date.now() - new Date(run.started_at).getTime();
          const hours = Math.floor(durationMs / 3_600_000);
          const minutes = Math.floor((durationMs % 3_600_000) / 60_000);

          const html = `
            <h2>Stock refresh complete ✅</h2>
            <p>The bulk reactivation stock sync has finished.</p>
            <ul>
              <li><strong>Initial queue:</strong> ${run.total_initial}</li>
              <li><strong>Synced OK:</strong> ${syncedOk ?? 0}</li>
              <li><strong>Errors:</strong> ${syncedError ?? 0}</li>
              <li><strong>Duration:</strong> ${hours}h ${minutes}m</li>
            </ul>
            <p><a href="${APP_BASE_URL}/admin/stock-refresh-monitor">View dashboard</a></p>
          `;

          const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "GetPawsy Monitor <noreply@getpawsy.pet>",
              to: [notifyEmail],
              subject: `[GetPawsy] Stock refresh complete — ${run.total_initial} products synced`,
              html,
            }),
          });

          if (resp.ok) {
            notified = true;
            await supabase
              .from("stock_refresh_runs")
              .update({ notified_complete_at: new Date().toISOString() })
              .eq("id", run.id);
          } else {
            console.error("Resend failed:", await resp.text());
          }
        } catch (err) {
          console.error("Notify error:", err);
        }
      } else {
        // No Resend — still mark notified so we don't loop
        await supabase
          .from("stock_refresh_runs")
          .update({ notified_complete_at: new Date().toISOString() })
          .eq("id", run.id);
        notified = true;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        traceId: trace,
        run_id: run.id,
        total_initial: run.total_initial,
        remaining: remaining ?? 0,
        synced_ok: syncedOk ?? 0,
        synced_error: syncedError ?? 0,
        is_complete: isComplete,
        notified,
        message: isComplete ? "Refresh complete" : `${remaining} products still pending`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[stock-refresh-monitor] error", message);
    return new Response(
      JSON.stringify({ ok: false, traceId: trace, message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});