import { corsHeaders } from "./cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

export { corsHeaders };

export function svc() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return { ok: false as const, res: err("missing auth", 401) };
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return { ok: false as const, res: err("unauthenticated", 401) };
  const admin = svc();
  const { data: role } = await admin.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
  if (!role) return { ok: false as const, res: err("forbidden", 403) };
  return { ok: true as const, userId: u.user.id };
}

export function ok(body: unknown, traceId = crypto.randomUUID()) {
  return new Response(JSON.stringify({ ok: true, traceId, ...((body as object) ?? {}) }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function err(message: string, status = 500, traceId = crypto.randomUUID()) {
  return new Response(JSON.stringify({ ok: false, traceId, message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function getSettings(): Promise<{ emergency_stop: boolean; flags: Record<string, boolean>; caps: Record<string, number> }> {
  const sb = svc();
  const { data } = await sb.from("acos_settings").select("key,value");
  const map = new Map<string, unknown>((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  return {
    emergency_stop: Boolean(map.get("emergency_stop")),
    flags: (map.get("feature_flags") as Record<string, boolean>) ?? {},
    caps: (map.get("budget_caps") as Record<string, number>) ?? {},
  };
}

export async function canRun(engine: string): Promise<{ allowed: boolean; reason?: string; mutationsAllowed: boolean }> {
  const s = await getSettings();
  if (s.emergency_stop) return { allowed: false, reason: "emergency_stop", mutationsAllowed: false };
  const flag = s.flags[engine];
  // Observation always allowed; mutations require the flag.
  return { allowed: true, mutationsAllowed: flag === true };
}

export async function logDecision(row: {
  engine: string; action: string; target_kind?: string; target_ref?: string;
  reason?: string; expected_outcome?: unknown; observed_only?: boolean;
}) {
  const sb = svc();
  await sb.from("acos_decisions").insert({
    engine: row.engine,
    action: row.action,
    target_kind: row.target_kind ?? null,
    target_ref: row.target_ref ?? null,
    reason: row.reason ?? null,
    expected_outcome: row.expected_outcome ?? {},
    observed_only: row.observed_only ?? true,
    status: "recorded",
  });
}

export async function startStep(runId: string, engine: string) {
  const sb = svc();
  const { data } = await sb.from("acos_orchestrator_steps").insert({ run_id: runId, engine, status: "running" }).select("id").single();
  return data?.id as string | undefined;
}

export async function finishStep(stepId: string | undefined, patch: { status: "ok" | "error"; rows_written?: number; detail?: unknown; error?: string }) {
  if (!stepId) return;
  const sb = svc();
  const started = await sb.from("acos_orchestrator_steps").select("started_at").eq("id", stepId).single();
  const startedAt = started.data?.started_at ? new Date(started.data.started_at).getTime() : Date.now();
  await sb.from("acos_orchestrator_steps").update({
    status: patch.status,
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    rows_written: patch.rows_written ?? 0,
    detail: patch.detail ?? {},
    error: patch.error ?? null,
  }).eq("id", stepId);
}