// cinematic-ad-rescore-bulk
//
// Bulk re-scores existing cinematic_ad_jobs against the new Domination Mode
// lat by invoking cinematic-ad-validate for each candidate job. Does NOT
// trigger any re-render or re-prepare — pure scoring refresh. Hook + voice
// engines are invoked first so the validate composite has fresh inputs.
//
// POST { limit?: number, statuses?: string[], with_engines?: boolean, dry_run?: boolean }
// Resp { ok, traceId, scanned, rescored, regen_candidates, sample }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const trace = () => `rsc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

async function callFn(fnName: string, payload: unknown) {
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/${fnName}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        ...(RENDER_WORKER_SECRET ? { "x-render-secret": RENDER_WORKER_SECRET } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { message: (e as Error).message } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  if (req.method !== "POST") return json(405, { ok: false, traceId, message: "POST required" });

  let body: { limit?: number; statuses?: string[]; with_engines?: boolean; dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* noop */ }

  const limit = Math.min(200, Math.max(1, Number(body.limit ?? 50)));
  const statuses = Array.isArray(body.statuses) && body.statuses.length
    ? body.statuses
    : ["render_complete", "pinterest_uploaded", "published", "awaiting_approval", "completed"];
  const withEngines = body.with_engines !== false;
  const dryRun = body.dry_run === true;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: jobs, error } = await supabase
    .from("cinematic_ad_jobs")
    .select("id, status, product_slug, final_creative_score, hard_reject_reasons, hook_score, voice_score")
    .in("status", statuses)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) return json(500, { ok: false, traceId, message: error.message });

  const sample: any[] = [];
  let rescored = 0;
  const regenCandidates: Array<{ id: string; product_slug: string; final_creative_score: number; hard_reject_reasons: string[] }> = [];

  for (const j of jobs ?? []) {
    if (dryRun) { sample.push({ id: (j as any).id, skipped: "dry_run" }); continue; }
    if (withEngines) {
      await callFn("cinematic-hook-engine", { job_id: (j as any).id });
      await callFn("cinematic-voice-engine", { job_id: (j as any).id });
      // Phase 2: Domination output engines (no reject logic, pure enrichment)
      await callFn("cinematic-voice-selector",  { job_id: (j as any).id });
      await callFn("cinematic-motion-engine",   { job_id: (j as any).id });
      await callFn("cinematic-pinterest-perf",  { job_id: (j as any).id });
    }
    const r = await callFn("cinematic-ad-validate", { job_id: (j as any).id });
    if (r.ok) rescored++;
    const finalScore = Number((r.data as any)?.domination?.final_creative_score ?? 0);
    const hardRejects: string[] = (r.data as any)?.domination?.hard_reject_reasons ?? [];
    if (finalScore < 95 || hardRejects.length > 0) {
      regenCandidates.push({ id: (j as any).id, product_slug: (j as any).product_slug, final_creative_score: finalScore, hard_reject_reasons: hardRejects });
    }
    if (sample.length < 10) sample.push({ id: (j as any).id, final_creative_score: finalScore, hard_reject_reasons: hardRejects, status: r.status });
  }

  return json(200, {
    ok: true,
    traceId,
    scanned: (jobs ?? []).length,
    rescored,
    regen_candidate_count: regenCandidates.length,
    regen_candidates: regenCandidates,
    sample,
  });
});
