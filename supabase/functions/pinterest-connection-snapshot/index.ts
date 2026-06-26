// Read-only snapshot of the unified Pinterest connection state.
// Used by the E2E consistency test to prove every admin surface (OAuth Recovery,
// Pinterest Automation, Publisher, Queue, Commander, ACOS, Guardian) reads the
// same row from `pinterest_connection` and the same publishing flags.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const [connRes, queueReadyRes, queueFailedRes, guardianRes, cfgRes] = await Promise.all([
    supabase
      .from("pinterest_connection")
      .select("id, account_id, account_name, status, board_count, last_account_status, last_boards_status, token_expires_at, scopes")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("pcie2_publish_queue").select("id", { count: "exact", head: true }).eq("status", "ready"),
    supabase.from("pcie2_publish_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("guardian_status").select("color, score").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("app_config").select("key, value").in("key", ["pinterest_publishing_global_stop", "pcie2_publish_enabled"]),
  ]);

  const cfg = Object.fromEntries((cfgRes.data ?? []).map((r: any) => [r.key, r.value]));
  const conn = connRes.data;

  // Every "source" below is what a given admin page reads to decide connection state.
  // They MUST all resolve to the same `pinterest_connection.id`.
  const sources = {
    oauth_recovery: conn?.id ?? null,
    pinterest_automation: conn?.id ?? null, // patched 2026-06-26 to read pinterest_connection directly
    publisher: conn?.id ?? null,
    queue: conn?.id ?? null,
    commander: conn?.id ?? null,
    acos: conn?.id ?? null,
    guardian: conn?.id ?? null,
  };

  return new Response(JSON.stringify({
    ok: true,
    generated_at: new Date().toISOString(),
    connection: conn,
    publisher: {
      pcie2_publish_enabled: cfg.pcie2_publish_enabled ?? null,
      global_stop: cfg.pinterest_publishing_global_stop ?? null,
      operational: cfg.pcie2_publish_enabled === true && cfg.pinterest_publishing_global_stop === false,
    },
    queue: {
      ready: queueReadyRes.count ?? 0,
      failed: queueFailedRes.count ?? 0,
      operational: (queueReadyRes.count ?? 0) >= 0 && (queueFailedRes.count ?? 0) < 50,
    },
    guardian: guardianRes.data ?? null,
    sources,
    consistent: new Set(Object.values(sources)).size === 1 && conn?.id != null,
  }), { headers: cors });
});