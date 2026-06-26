// PQIF v4 shared helpers — additive growth AI layer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function svc() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function startRun(runType: string, checkpoint: Record<string, unknown> = {}) {
  const s = svc();
  const { data, error } = await s.from("pqif_v4_runs")
    .insert({ run_type: runType, status: "running", checkpoint })
    .select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function finishRun(runId: string, status: "ok" | "error" | "halted", summary: Record<string, unknown> = {}, error?: string) {
  const s = svc();
  await s.from("pqif_v4_runs").update({
    status, summary, error: error ?? null, finished_at: new Date().toISOString(),
  }).eq("id", runId);
}

export async function logDecision(runId: string, decisionType: string, verdict: string, evidence: Record<string, unknown>, subject?: { type?: string; id?: string }) {
  const s = svc();
  await s.from("pqif_v4_decisions").insert({
    run_id: runId, decision_type: decisionType, verdict, evidence,
    subject_type: subject?.type ?? null, subject_id: subject?.id ?? null,
  });
}

export async function isPublishingBlocked(): Promise<{ blocked: boolean; reasons: string[] }> {
  const s = svc();
  const reasons: string[] = [];
  const { data: cfg } = await s.from("app_config").select("value").eq("key", "pinterest_publishing_global_stop").maybeSingle();
  if (cfg && (cfg.value === true || cfg.value === "true")) reasons.push("global_stop");
  const { data: v4 } = await s.from("pqif_v4_settings").select("publishing_enabled").eq("id", 1).maybeSingle();
  if (!v4?.publishing_enabled) reasons.push("v4_publishing_disabled");
  return { blocked: reasons.length > 0, reasons };
}

export async function aiJson(prompt: string, system?: string, model = "google/gemini-3-flash-preview"): Promise<any> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const messages: any[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "pqif-v4" },
    body: JSON.stringify({ model, messages, response_format: { type: "json_object" } }),
  });
  if (!resp.ok) throw new Error(`AI gateway ${resp.status}`);
  const data = await resp.json();
  try { return JSON.parse(data?.choices?.[0]?.message?.content ?? "{}"); } catch { return {}; }
}