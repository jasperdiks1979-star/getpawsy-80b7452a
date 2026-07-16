// Wave isolation helper — when a canary/wave is running, the operator sets
// `pinterest_runtime_settings.wave_isolation_active_run_id`. While it is set:
//   - `pinterest-cron-worker` only publishes rows whose `run_id` matches;
//   - every legacy paid Pinterest edge function refuses to spend unless the
//     caller supplies the matching `run_id` in the request body.
//
// Read-only helper. Zero paid calls.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export async function getActiveIsolationRunId(
  sb: SupabaseClient,
): Promise<string | null> {
  const { data } = await sb
    .from("pinterest_runtime_settings")
    .select("wave_isolation_active_run_id")
    .eq("id", 1)
    .maybeSingle();
  const v = (data as { wave_isolation_active_run_id?: string | null } | null)
    ?.wave_isolation_active_run_id;
  return v && typeof v === "string" ? v : null;
}

export async function setActiveIsolationRunId(
  sb: SupabaseClient,
  run_id: string | null,
): Promise<void> {
  await sb
    .from("pinterest_runtime_settings")
    .update({ wave_isolation_active_run_id: run_id, updated_at: new Date().toISOString() })
    .eq("id", 1);
}

/**
 * Called at the top of every legacy paid Pinterest edge function. When
 * isolation is active and the caller's body run_id does NOT match, return a
 * 423 Response and skip the function body — no paid call is possible.
 */
export async function assertIsolationAllows(
  sb: SupabaseClient,
  body_run_id: string | null | undefined,
  cors: HeadersInit,
): Promise<Response | null> {
  const active = await getActiveIsolationRunId(sb);
  if (!active) return null; // No canary in flight — legacy behavior preserved.
  if (body_run_id && body_run_id === active) return null;
  return new Response(
    JSON.stringify({
      ok: false,
      reason: "wave_isolation_active",
      active_run_id: active,
      hint: "A controlled Pinterest wave is running. Pass matching run_id or wait for it to clear.",
    }),
    { status: 423, headers: { ...cors, "Content-Type": "application/json" } },
  );
}