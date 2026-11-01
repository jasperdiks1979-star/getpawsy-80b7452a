import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canRunStockSyncWatchdog } from "../_shared/stock-sync-watchdog-policy.ts";

/**
 * Independent, opt-in watchdog. Scheduling is deliberately NOT installed here:
 * an operator must validate PR #32, cron credentials and the database migration,
 * then configure a service-authenticated periodic trigger.
 * No inventory is reset and no retries run inside this invocation.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!canRunStockSyncWatchdog(
    req.method,
    req.headers.get("authorization"),
    serviceKey,
    Deno.env.get("STOCK_SYNC_RECOVERY_ENABLED"),
  )) {
    return new Response(JSON.stringify({ error: "Watchdog disabled or unauthorized" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl || !serviceKey) return new Response("Configuration unavailable", { status: 503 });
  const supabase = createClient(supabaseUrl, serviceKey);
  try {
    const { data: progress, error: readError } = await supabase.from("sync_progress")
      .select("status,last_offset,total_products,last_sync_at")
      .eq("id", "stock-sync").maybeSingle();
    if (readError) throw readError;
    if (!progress || progress.status !== "running" ||
        !Number.isSafeInteger(progress.last_offset) || progress.last_offset <= 0 ||
        progress.last_offset >= progress.total_products) {
      return Response.json({ claimed: false, reason: "No partial running sync" });
    }

    // The SECURITY DEFINER RPC locks the checkpoint, verifies >=30min stalled,
    // enforces one lease and limits retries to 3 per unchanged checkpoint.
    const { data: claimed, error: claimError } = await supabase.rpc(
      "claim_stalled_stock_sync_recovery",
      { p_expected_offset: progress.last_offset },
    );
    if (claimError) throw claimError;
    if (claimed !== true) {
      return Response.json({ claimed: false, checkpoint: progress.last_offset });
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/sync-stock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ action: "resume", source: "cron", offset: 0 }),
      signal: AbortSignal.timeout(20_000),
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Recovery trigger HTTP ${response.status}: ${responseText.slice(0, 200)}`);
    }
    const result = JSON.parse(responseText);
    if (result?.success === false || result?.error) {
      throw new Error(`Recovery rejected: ${String(result.error ?? "batch error").slice(0, 200)}`);
    }
    return Response.json({
      claimed: true,
      checkpoint_before: progress.last_offset,
      checkpoint_reported: result?.progress?.current ?? null,
      note: "Check sync_progress for persisted progress; a 200 alone is not proof",
    });
  } catch (error) {
    console.error("Stock sync recovery failed:", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Recovery attempt failed; retry is lease-limited" }, { status: 502 });
  }
});
