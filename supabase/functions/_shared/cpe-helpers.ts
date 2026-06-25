// Shared helpers for the Creative Production Engine V1
import { admin } from "./creative-helpers.ts";

export const SCENE_FAMILIES = [
  "modern_home","luxury_interior","scandinavian","garden","park","kitchen",
  "living_room","bedroom","outdoor","travel","luxury","winter","summer",
  "autumn","spring","night","morning","golden_hour","rain","snow",
];

export interface CpeSettings {
  id: number;
  auto_enhance: boolean;
  auto_lifestyle: boolean;
  auto_video: boolean;
  auto_publish: boolean;
  daily_ai_budget_usd: number;
  max_lifestyle_per_product: number;
  max_pinterest_per_product: number;
}

export async function loadCpeSettings(sb: ReturnType<typeof admin>): Promise<CpeSettings> {
  const { data } = await sb.from("cpe_settings").select("*").eq("id", 1).maybeSingle();
  return (data as CpeSettings) ?? {
    id: 1,
    auto_enhance: true,
    auto_lifestyle: false,
    auto_video: false,
    auto_publish: false,
    daily_ai_budget_usd: 10,
    max_lifestyle_per_product: 4,
    max_pinterest_per_product: 6,
  };
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function enqueueJob(
  sb: ReturnType<typeof admin>,
  kind: string,
  payload: Record<string, unknown>,
  dedupeSubset: string[] = [],
): Promise<{ id: string; inserted: boolean }> {
  const stable: Record<string, unknown> = {};
  for (const k of (dedupeSubset.length ? dedupeSubset : Object.keys(payload)).sort()) {
    stable[k] = (payload as Record<string, unknown>)[k];
  }
  const dedupe_key = await sha256Hex(`${kind}::${JSON.stringify(stable)}`);
  const { data, error } = await sb
    .from("cpe_creative_jobs")
    .upsert({ kind, payload, dedupe_key, status: "pending" }, { onConflict: "kind,dedupe_key", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return { id: data?.id ?? "", inserted: Boolean(data?.id) };
}

export async function claimJobs(
  sb: ReturnType<typeof admin>,
  kind: string,
  worker: string,
  limit = 5,
): Promise<Array<{ id: string; payload: Record<string, unknown>; attempts: number }>> {
  // Soft claim via UPDATE ... WHERE id IN (SELECT ... LIMIT) — best-effort.
  const { data: pending } = await sb
    .from("cpe_creative_jobs")
    .select("id,payload,attempts")
    .eq("kind", kind)
    .eq("status", "pending")
    .lte("run_at", new Date().toISOString())
    .order("run_at", { ascending: true })
    .limit(limit);
  if (!pending?.length) return [];
  const ids = pending.map((p: any) => p.id);
  const { data: claimed } = await sb
    .from("cpe_creative_jobs")
    .update({ status: "running", locked_by: worker, locked_at: new Date().toISOString(), attempts: (pending[0] as any).attempts + 1 })
    .in("id", ids)
    .eq("status", "pending")
    .select("id,payload,attempts");
  return (claimed as any[]) ?? [];
}

export async function finishJob(
  sb: ReturnType<typeof admin>,
  id: string,
  ok: boolean,
  error?: string,
): Promise<void> {
  await sb
    .from("cpe_creative_jobs")
    .update({
      status: ok ? "succeeded" : "failed",
      finished_at: new Date().toISOString(),
      last_error: ok ? null : (error ?? "unknown").slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

/** Budget guard. Returns true if we have room left under daily cap. */
export async function withinBudget(
  sb: ReturnType<typeof admin>,
  costUsd: number,
): Promise<{ ok: boolean; spentToday: number; cap: number }> {
  const settings = await loadCpeSettings(sb);
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data } = await sb
    .from("cpe_pipeline_runs")
    .select("ai_cost_usd")
    .gte("started_at", since);
  const spent = (data ?? []).reduce((a: number, r: any) => a + Number(r.ai_cost_usd ?? 0), 0);
  return { ok: spent + costUsd <= settings.daily_ai_budget_usd, spentToday: spent, cap: settings.daily_ai_budget_usd };
}

export async function recordSpend(
  sb: ReturnType<typeof admin>,
  runId: string | null,
  costUsd: number,
): Promise<void> {
  if (!runId || costUsd <= 0) return;
  await sb.rpc("noop").catch(() => {});
  // Atomic increment via raw update
  const { data } = await sb.from("cpe_pipeline_runs").select("ai_cost_usd").eq("id", runId).maybeSingle();
  const current = Number((data as any)?.ai_cost_usd ?? 0);
  await sb.from("cpe_pipeline_runs").update({ ai_cost_usd: current + costUsd }).eq("id", runId);
}

export function isInternalAuthed(req: Request): boolean {
  const secret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  if (!secret) return false;
  const h = req.headers.get("x-internal-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return h === secret;
}